package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.translation.domain.ContentLocale;
import java.util.Locale;
import java.util.Optional;

import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.procurement.domain.BatchEta;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ComingDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ComingLineDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.LineDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ProductPreorderDto;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.preorder.domain.PreorderErrors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the customer reads about queues: their own places, the pre-order block of a product page and the
 * «Скоро в наявності» list. Read-only; joining, leaving and hand-outs are {@link PreorderQueueService}.
 */
@Service
public class PreorderQueueReader {

    private final PreorderSubscriptionRepository subs;
    private final BatchCatalog batches;
    private final Products products;
    private final SettingsService settings;
    private final Messages messages;
    private final Clock clock;
    private final PreorderQueueService queue;
    private final ShopZone shopZone;

    public PreorderQueueReader(PreorderSubscriptionRepository subs, BatchCatalog batches, Products products,
                               SettingsService settings, Messages messages, Clock clock, PreorderQueueService queue,
                               ShopZone shopZone) {
        this.subs = subs;
        this.batches = batches;
        this.products = products;
        this.settings = settings;
        this.messages = messages;
        this.clock = clock;
        this.queue = queue;
        this.shopZone = shopZone;
    }

    /** My queues, live first, then the latest history («Мої очікування»). */
    @Transactional(readOnly = true)
    public List<MyPreorderDto> listMine(long userId) {
        List<PreorderSubscription> rows = subs.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50));
        Map<String, Product> byId = queue.productsOf(rows.stream().map(PreorderSubscription::getProductId).toList());
        Map<String, EtaDto> etas = queue.openEtas();
        List<MyPreorderDto> out = new ArrayList<>();
        for (PreorderSubscription s : rows) {
            Product p = byId.get(UuidUtil.toString(s.getProductId()));
            if (p != null) {
                out.add(queue.toMine(s, p, etas.get(Lines.key(s.getProductId(), s.getVariantId()))));
            }
        }
        // A hold (act now) first, then the queues, then history; newest first inside each.
        out.sort(Comparator.comparingInt((MyPreorderDto d) -> switch (Status.valueOf(d.status())) {
            case HELD, NOTIFIED -> 0;
            case WAITING -> 1;
            default -> 2;
        }));
        return out;
    }

    /** The pre-order block of a product page; {@code userId} null for a guest. */
    @Transactional(readOnly = true)
    public ProductPreorderDto forProduct(String productIdText, Long userId) {
        byte[] productId = PreorderQueueService.bytes(productIdText);
        Product product = products.findById(productId)
                .orElseThrow(() -> PreorderErrors.notFound(messages.current("api.preorder.notFound")));
        LocalDate today = shopZone.today(clock);
        // variant id (or "" for the product itself) → its soonest open batch
        Map<String, PreorderBatch> lines = new LinkedHashMap<>();
        for (BatchCatalog.PublicLine row : batches.publicLines(productId)) {
            PreorderBatchItem i = row.item();
            lines.merge(i.getVariantId() == null ? "" : UuidUtil.toString(i.getVariantId()),
                    row.batch(), BatchEta::sooner);
        }
        List<LineDto> lineDtos = new ArrayList<>();
        lines.forEach((variant, b) -> lineDtos.add(new LineDto(variant.isEmpty() ? null : variant, BatchCatalog.eta(b, today))));
        int showFrom = settings.getInt(SettingsRegistry.PREORDER_SHOW_WAITING_FROM);
        long people = subs.countPeople(productId);
        Integer waiting = showFrom > 0 && people >= showFrom ? (int) people : null;
        List<MyPreorderDto> mine = new ArrayList<>();
        if (userId != null) {
            Map<String, EtaDto> etas = queue.openEtas();
            for (PreorderSubscription s : subs.findByUserIdAndStatusIn(userId, PreorderQueueService.LIVE)) {
                if (Arrays.equals(s.getProductId(), productId)) {
                    mine.add(queue.toMine(s, product, etas.get(Lines.key(s.getProductId(), s.getVariantId()))));
                }
            }
        }
        PreorderBatch soonest = lines.values().stream().reduce(BatchEta::sooner).orElse(null);
        int hold = soonest != null ? soonest.getHoldHours() : settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS);
        return new ProductPreorderDto(UuidUtil.toString(productId), lineDtos, waiting,
                settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT), mine, hold);
    }

    /** «Скоро в наявності»: open public batches, soonest first, with their lines. */
    @Transactional(readOnly = true)
    public List<ComingDto> coming() {
        LocalDate today = shopZone.today(clock);
        Map<Long, PreorderBatch> byBatch = new LinkedHashMap<>();
        Map<Long, List<ComingLineDto>> linesOf = new HashMap<>();
        for (BatchCatalog.PublicLine row : batches.publicLines()) {
            PreorderBatchItem i = row.item();
            PreorderBatch b = row.batch();
            byBatch.putIfAbsent(b.getId(), b);
            linesOf.computeIfAbsent(b.getId(), k -> new ArrayList<>()).add(new ComingLineDto(
                    UuidUtil.toString(i.getProductId()),
                    i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId())));
        }
        return byBatch.values().stream()
                .sorted(BatchEta::bySoonest)
                .map(b -> new ComingDto(BatchCatalog.eta(b, today), linesOf.get(b.getId()), b.getHoldHours()))
                .toList();
    }

    /** Whose place this is (the bot needs their language before it describes the place). */
    @Transactional(readOnly = true)
    public Long ownerOf(long subscriptionId) {
        return subs.findById(subscriptionId).map(PreorderSubscription::getUserId).orElse(null);
    }

    /** One place as its owner sees it, with the product (for the bot messages); empty if either is gone. */
    @Transactional(readOnly = true)
    public Optional<Described> describe(long subscriptionId, Locale locale) {
        return subs.findById(subscriptionId).flatMap(s -> products.findById(s.getProductId()).map(p ->
                new Described(s.getUserId(), queue.toMine(s, p, queue.openEtas().get(Lines.key(s.getProductId(), s.getVariantId())),
                        ContentLocale.normalize(locale)), p.getPriceMinor())));
    }

    public record Described(Long userId, MyPreorderDto place, long priceMinor) {
    }
}
