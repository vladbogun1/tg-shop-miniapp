package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.app.PreorderDtos.DemandDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseRequest;
import com.maxsolch.shop.preorder.app.PreorderDtos.ReleaseResult;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscriberDto;
import com.maxsolch.shop.preorder.domain.PreorderErrors;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.LineProducts;
import com.maxsolch.shop.procurement.domain.BatchQueue;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.customer.app.Customers;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * What the admin does with pre-order queues: who waits for a batch or a product, taking somebody off a queue,
 * handing out holds after a restock outside a batch, «Чего ждут», the numbers for a period. Each method is one
 * transaction; the audit entries are written around them by {@link AdminPreorders}.
 */
@Service
public class PreorderQueueAdmin {

    private final PreorderSubscriptionRepository subs;
    private final BatchCatalog batches;
    private final LineProducts lineProducts;
    private final Customers users;
    private final Products products;
    private final PreorderQueueService queue;
    private final SettingsService settings;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final ShopZone shopZone;

    public PreorderQueueAdmin(PreorderSubscriptionRepository subs, BatchCatalog batches, LineProducts lineProducts,
                          Customers users, Products products, PreorderQueueService queue,
                          SettingsService settings, ApplicationEventPublisher events, Clock clock, ShopZone shopZone) {
        this.subs = subs;
        this.batches = batches;
        this.lineProducts = lineProducts;
        this.users = users;
        this.products = products;
        this.queue = queue;
        this.settings = settings;
        this.events = events;
        this.clock = clock;
        this.shopZone = shopZone;
    }

    /** Everybody queued for the lines of a batch, live first, in line order. */
    @Transactional(readOnly = true)
    public List<SubscriberDto> subscribersOfBatch(long id) {
        batches.require(id);
        List<PreorderSubscription> rows = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (PreorderBatchItem i : batches.linesOf(id)) {
            if (seen.add(Lines.key(i.getProductId(), i.getVariantId()))) {
                rows.addAll(subs.queue(i.getProductId(), i.getVariantId()));
            }
        }
        return toSubscribers(rows);
    }

    /** The live queue of a product (all its variants). */
    @Transactional(readOnly = true)
    public List<SubscriberDto> subscribersOfProduct(String productId) {
        return subscribersOfProduct(productId, null);
    }

    /** Same, narrowed to one variant when {@code variantId} is given. */
    @Transactional(readOnly = true)
    public List<SubscriberDto> subscribersOfProduct(String productId, String variantId) {
        List<PreorderSubscription> rows = subs.findLiveByProduct(PreorderQueueService.bytes(productId));
        if (variantId != null && !variantId.isBlank()) {
            byte[] v = PreorderQueueService.bytes(variantId);
            rows = rows.stream().filter(s -> Arrays.equals(s.getVariantId(), v)).toList();
        }
        return toSubscribers(rows);
    }

    /**
     * Numbers for a period (Kyiv days, inclusive). Approximations, because a place keeps no history of its
     * hold: {@code holdsGiven} counts units of places whose last hold/notice time ({@code notifiedAt}) is in
     * the period and that were held, bought or expired (finished places by the quantity they asked for);
     * {@code boughtFromHold} / {@code expired} are units of places that were notified and closed as
     * BOUGHT / EXPIRED in the period. So the conversion mixes two cohorts when a hold spans the border —
     * fine for periods of weeks. {@code arrivedUnits} — qty arrived in batches marked arrived in the period.
     */
    @Transactional(readOnly = true)
    public PreorderDtos.MetricsDto metrics(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || from.plusDays(400).isBefore(to)) {
            throw PreorderErrors.badRequest("Период: даты ГГГГ-ММ-ДД, «по» не раньше «с», не больше 400 дней", "BAD_PERIOD");
        }
        Instant start = from.atStartOfDay(shopZone.zone()).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(shopZone.zone()).toInstant();
        Object[] joined = subs.joinedBetween(start, end).stream().findFirst().orElse(new Object[]{0L, 0L});
        int given = (int) subs.holdUnitsGiven(start, end);
        int bought = (int) subs.closedAfterHold(Status.BOUGHT.name(), start, end);
        int expired = (int) subs.closedAfterHold(Status.EXPIRED.name(), start, end);
        double conversion = given > 0 ? Math.round(bought * 1000.0 / given) / 10.0 : 0;
        return new PreorderDtos.MetricsDto((int) num(joined[0]), (int) num(joined[1]), given, bought, expired,
                conversion, (int) batches.arrivedUnitsBetween(start, end));
    }

    /** Takes somebody off a queue; their hold, if any, goes to the next person. */
    @Transactional
    public void removeSubscriber(long subscriptionId, String adminName) {
        PreorderSubscription s = subs.findById(subscriptionId)
                .orElseThrow(() -> PreorderErrors.notFound("Запись очереди не найдена"));
        if (!s.statusEnum().live()) {
            return;
        }
        Product p = products.findByIdForUpdate(s.getProductId()).orElse(null);
        boolean wasHeld = s.statusEnum() == Status.HELD;
        s.close(Status.CANCELLED, "убран админом" + (adminName == null ? "" : " (" + adminName + ")"), clock.instant());
        subs.save(s);
        events.publishEvent(new PreorderEvents.Closed(s.getId(), "ADMIN"));
        if (wasHeld && p != null) {
            queue.handOut(p, Lines.variantById(p, s.getVariantId()), s.getBatchId(),
                    Distribution.QUEUE_HOLD, queue.holdHours(s.getBatchId()), false);
        }
    }

    /** The stock of a line was raised by hand (not through a batch): hand it to the queue now. */
    @Transactional
    public ReleaseResult release(ReleaseRequest req) {
        byte[] productId = PreorderQueueService.bytes(req == null ? null : req.productId());
        Product p = products.findByIdForUpdate(productId).orElseThrow(() -> PreorderErrors.notFound("Товар не найден"));
        ProductVariant v = null;
        if (req.variantId() != null && !req.variantId().isBlank()) {
            v = Lines.variantById(p, PreorderQueueService.bytes(req.variantId()));
            if (v == null) {
                throw PreorderErrors.badRequest("Вариант не найден", "VARIANT_GONE");
            }
        }
        BatchQueue.HandOut h = queue.handOut(p, v, null, Distribution.QUEUE_HOLD,
                settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS), true);
        return new ReleaseResult(h.heldPeople(), h.heldQty(), h.shortPeople(), h.freeAfter());
    }

    /** «Чего ждут»: lines by the number of people waiting, with the batch that already brings them. */
    @Transactional(readOnly = true)
    public List<DemandDto> demand() {
        Instant weekAgo = clock.instant().minus(Duration.ofDays(7));
        List<Object[]> rows = subs.demand(weekAgo);
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, Product> byId = lineProducts.productsOf(rows.stream().map(r -> (byte[]) r[0]).toList());
        Map<String, PreorderBatch> openByLine = new HashMap<>();
        List<PreorderBatch> open = batches.openBatches();
        Map<Long, PreorderBatch> openById = open.stream().collect(Collectors.toMap(PreorderBatch::getId, Function.identity()));
        if (!open.isEmpty()) {
            for (PreorderBatchItem i : batches.linesOfBatches(openById.keySet())) {
                openByLine.putIfAbsent(Lines.key(i.getProductId(), i.getVariantId()),
                        openById.get(i.getBatchId()));
            }
        }
        Map<String, Long> peopleOfProduct = new HashMap<>();
        for (Object[] w : subs.waitingByProduct()) {
            peopleOfProduct.put(UuidUtil.toString((byte[]) w[0]), num(w[1]));
        }
        List<DemandDto> out = new ArrayList<>();
        for (Object[] r : rows) {
            byte[] productId = (byte[]) r[0];
            byte[] variantId = (byte[]) r[1];
            Product p = byId.get(UuidUtil.toString(productId));
            if (p == null) {
                continue;
            }
            ProductVariant v = Lines.variantById(p, variantId);
            PreorderBatch b = openByLine.get(Lines.key(productId, variantId));
            out.add(new DemandDto(UuidUtil.toString(productId), variantId == null ? null : UuidUtil.toString(variantId),
                    p.getTitle(), v == null ? null : v.getName(), Lines.imageOf(p),
                    Lines.stockOf(p, v), p.getPriceMinor(), num(r[2]), num(r[3]), (Instant) r[4],
                    num(r[5]), b == null ? null : b.getId(), b == null ? null : b.getTitle(),
                    peopleOfProduct.getOrDefault(UuidUtil.toString(productId), num(r[2]))));
        }
        return out;
    }

    private List<SubscriberDto> toSubscribers(List<PreorderSubscription> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, Product> byId = lineProducts.productsOf(rows.stream().map(PreorderSubscription::getProductId).toList());
        Map<Long, User> people = users.findAllById(rows.stream().map(PreorderSubscription::getUserId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getTelegramUserId, Function.identity()));
        // places in line, counted per line from the (already ordered) rows
        Map<String, Integer> waitingSeen = new HashMap<>();
        List<SubscriberDto> out = new ArrayList<>();
        for (PreorderSubscription s : rows) {
            Product p = byId.get(UuidUtil.toString(s.getProductId()));
            ProductVariant v = p == null ? null : Lines.variantById(p, s.getVariantId());
            Integer position = null;
            if (s.statusEnum() == Status.WAITING) {
                position = waitingSeen.merge(Lines.key(s.getProductId(), s.getVariantId()), 1, Integer::sum);
            }
            User u = people.get(s.getUserId());
            out.add(new SubscriberDto(s.getId(), s.getUserId(), u == null ? null : nameOf(u),
                    u == null ? null : u.getUsername(), u != null && u.isBotBlocked(),
                    UuidUtil.toString(s.getProductId()), s.getVariantId() == null ? null : UuidUtil.toString(s.getVariantId()),
                    p == null ? null : p.getTitle(), v == null ? null : v.getName(), s.getQty(), s.getStatus(), position,
                    s.getHeldQty(), s.getHoldUntil(), s.getSource(), s.getCreatedAt(), s.getClosedAt(), s.getCloseReason()));
        }
        return out;
    }

    private static String nameOf(User u) {
        String n = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return n.isEmpty() ? null : n;
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }
}
