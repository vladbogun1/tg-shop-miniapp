package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderRules;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.procurement.domain.BatchEta;
import com.maxsolch.shop.procurement.domain.BatchQueue.HandOut;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ComingDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ComingLineDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.LineDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.ProductPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscribeRequest;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.preorder.domain.PreorderErrors;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Queues for goods that are out of stock (docs/PREORDERS-PLAN.md): customers join and leave, arrivals and
 * restocks hand units out as holds in joining order, holds that run out pass on, and checkout keeps other
 * people's holds off the shelf.
 *
 * <p>Lock order is always product row → queue rows (the same as checkout, which locks the product and only
 * reads the holds), so a hand-out and an order for the same product serialise instead of deadlocking.
 */
@Service
public class PreorderQueueService {

    public static final String SOURCE_MINIAPP = "MINIAPP";
    public static final String SOURCE_WEB = "WEB";

    private static final ShopZone SHOP_ZONE = ShopZone.of(null);
    static final Duration REMIND_BEFORE = Duration.ofHours(3);
    static final List<String> LIVE = List.of(Status.WAITING.name(), Status.HELD.name(), Status.NOTIFIED.name());
    /** Queue size when the anti-hoarding limit is off. */
    static final int DEFAULT_MAX_QTY = 10;

    private final PreorderSubscriptionRepository subs;
    private final BatchCatalog batches;
    private final ProductRepository products;
    private final SettingsService settings;
    private final ApplicationEventPublisher events;
    private final Messages messages;
    private final Clock clock;

    public PreorderQueueService(PreorderSubscriptionRepository subs, BatchCatalog batches, ProductRepository products,
                                SettingsService settings, ApplicationEventPublisher events, Messages messages,
                                Clock clock) {
        this.subs = subs;
        this.batches = batches;
        this.products = products;
        this.settings = settings;
        this.events = events;
        this.messages = messages;
        this.clock = clock;
    }

    /** The catalog caches stock: a hold that appears or goes away changes what the shop shows as available. */
    private CacheManager cacheManager;
    private SiteRevalidator siteRevalidator;

    @Autowired(required = false)
    void setCacheManager(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    private TranslationService translations;

    @Autowired(required = false)
    void setTranslations(TranslationService translations) {
        this.translations = translations;
    }

    @Autowired(required = false)
    void setSiteRevalidator(SiteRevalidator siteRevalidator) {
        this.siteRevalidator = siteRevalidator;
    }

    // ---------------------------------------------------------------- customer

    /**
     * Joins the queue for a product/variant nobody can buy right now (stock 0, or all of it held for others).
     * Joining again changes the quantity while still waiting; a held or notified place is returned as is.
     */
    @Transactional
    public MyPreorderDto subscribe(long userId, String source, SubscribeRequest req) {
        byte[] productId = bytes(req == null ? null : req.productId());
        Product product = products.findByIdForUpdate(productId)
                .orElseThrow(() -> PreorderErrors.notFound(messages.current("api.preorder.notFound")));
        if (!product.isActive() || product.isArchived()) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.unavailable", product.getTitle()));
        }
        ProductVariant variant = variantOf(product, req.variantId());
        byte[] variantId = variant == null ? null : variant.getId();

        int maxQty = maxQty();
        int qty = req.qty() == null ? 1 : req.qty();
        if (qty < 1 || qty > maxQty) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.qty", maxQty));
        }

        Optional<PreorderSubscription> existing = subs.findLive(userId, productId, variantId).stream().findFirst();
        if (existing.isPresent()) {
            PreorderSubscription s = existing.get();
            if (s.statusEnum() == Status.WAITING && s.getQty() != qty) {
                s.setQty(qty);
                subs.save(s);
            }
            return toMine(s, product, openEta(productId, variantId));
        }

        List<PreorderSubscription> queue = subs.queue(productId, variantId);
        if (PreorderRules.free(Lines.stockOf(product, variant), seats(queue)) > 0) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.inStock"), "IN_STOCK");
        }
        EtaDto eta = openEta(productId, variantId);
        if (eta == null && !settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.unavailable", product.getTitle()));
        }
        int maxActive = settings.getInt(SettingsRegistry.PREORDER_MAX_ACTIVE);
        if (maxActive > 0 && subs.countByUserIdAndStatusIn(userId, LIVE) >= maxActive) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.tooMany", maxActive), "TOO_MANY");
        }

        PreorderSubscription s = new PreorderSubscription();
        s.setUserId(userId);
        s.setProductId(productId);
        s.setVariantId(variantId);
        s.setQty(qty);
        s.setSource(SOURCE_WEB.equals(source) ? SOURCE_WEB : SOURCE_MINIAPP);
        s.setCreatedAt(clock.instant());
        PreorderSubscription saved = subs.save(s);
        events.publishEvent(new PreorderEvents.Subscribed(saved.getId()));
        return toMine(saved, product, eta);
    }

    /** Leaves a queue. A held unit goes to the next person at once. */
    @Transactional
    public void unsubscribe(long userId, long id) {
        PreorderSubscription s = subs.findById(id)
                .filter(x -> x.getUserId() == userId)
                .orElseThrow(() -> PreorderErrors.notFound(messages.current("api.preorder.notFound")));
        if (!s.statusEnum().live()) {
            return;
        }
        Product product = products.findByIdForUpdate(s.getProductId()).orElse(null);
        boolean wasHeld = s.statusEnum() == Status.HELD;
        s.close(Status.CANCELLED, "вышел из очереди", clock.instant());
        subs.save(s);
        if (wasHeld && product != null) {
            holdsChanged(product);
            handOut(product, Lines.variantById(product, s.getVariantId()), s.getBatchId(), Distribution.QUEUE_HOLD,
                    holdHours(s.getBatchId()), false);
        }
    }

    /**
     * The product left sale (archived or hidden): everybody still in its queues is taken off and told after
     * commit. Runs in the caller's transaction; the product row is already locked or about to be saved.
     */
    public int closeForProduct(byte[] productId) {
        Instant now = clock.instant();
        int n = 0;
        for (PreorderSubscription s : subs.findLiveByProduct(productId)) {
            s.close(Status.CANCELLED, "товар снят с продажи", now);
            subs.save(s);
            events.publishEvent(new PreorderEvents.Closed(s.getId(), "PRODUCT_GONE"));
            n++;
        }
        return n;
    }

    /** My queues, live first, then the latest history («Мої очікування»). */
    @Transactional(readOnly = true)
    public List<MyPreorderDto> listMine(long userId) {
        List<PreorderSubscription> rows = subs.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50));
        Map<String, Product> byId = productsOf(rows.stream().map(PreorderSubscription::getProductId).toList());
        Map<String, EtaDto> etas = openEtas();
        List<MyPreorderDto> out = new ArrayList<>();
        for (PreorderSubscription s : rows) {
            Product p = byId.get(UuidUtil.toString(s.getProductId()));
            if (p != null) {
                out.add(toMine(s, p, etas.get(Lines.key(s.getProductId(), s.getVariantId()))));
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

    /** Whose place this is (the bot needs their language before it describes the place). */
    @Transactional(readOnly = true)
    public Long ownerOf(long subscriptionId) {
        return subs.findById(subscriptionId).map(PreorderSubscription::getUserId).orElse(null);
    }

    /** One place as its owner sees it, with the product (for the bot messages); empty if either is gone. */
    @Transactional(readOnly = true)
    public Optional<Described> describe(long subscriptionId, Locale locale) {
        return subs.findById(subscriptionId).flatMap(s -> products.findById(s.getProductId()).map(p ->
                new Described(s.getUserId(), toMine(s, p, openEtas().get(Lines.key(s.getProductId(), s.getVariantId())),
                        ContentLocale.normalize(locale)), p.getPriceMinor())));
    }

    public record Described(Long userId, MyPreorderDto place, long priceMinor) {
    }

    /** The pre-order block of a product page; {@code userId} null for a guest. */
    @Transactional(readOnly = true)
    public ProductPreorderDto forProduct(String productIdText, Long userId) {
        byte[] productId = bytes(productIdText);
        Product product = products.findById(productId)
                .orElseThrow(() -> PreorderErrors.notFound(messages.current("api.preorder.notFound")));
        LocalDate today = SHOP_ZONE.today(clock);
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
            Map<String, EtaDto> etas = openEtas();
            for (PreorderSubscription s : subs.findByUserIdAndStatusIn(userId, LIVE)) {
                if (Arrays.equals(s.getProductId(), productId)) {
                    mine.add(toMine(s, product, etas.get(Lines.key(s.getProductId(), s.getVariantId()))));
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
        LocalDate today = SHOP_ZONE.today(clock);
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

    // ---------------------------------------------------------------- checkout

    /**
     * Units of a line held for people other than {@code userId} (null = a guest / the admin): checkout
     * must leave them on the shelf. Read inside the order transaction after the product row is locked.
     */
    public int heldForOthers(byte[] productId, byte[] variantId, Long userId) {
        // A locking read, not the aggregate: under REPEATABLE READ a plain SELECT shows the snapshot of the
        // order's first read, which may predate a hold that the expiry job released while we waited for the
        // product lock. FOR UPDATE reads the latest committed rows.
        return subs.lockQueue(productId, variantId).stream()
                .filter(s -> s.statusEnum() == Status.HELD && (userId == null || !userId.equals(s.getUserId())))
                .mapToInt(PreorderSubscription::getHeldQty).sum();
    }

    /** Units on hold per line ({@link #lineKey}) — the catalog subtracts them from the stock it shows. */
    public Map<String, Integer> heldByLine() {
        Map<String, Integer> out = new HashMap<>();
        for (Object[] row : subs.heldByLine()) {
            out.put(Lines.key((byte[]) row[0], (byte[]) row[1]), ((Number) row[2]).intValue());
        }
        return out;
    }

    /**
     * An order was placed: the buyer's places in these lines are done. A hold bigger than what was bought
     * frees the rest, which goes to the next person. Runs in the order transaction (products locked).
     */
    public void onOrderPlaced(Long userId, byte[] orderId, Collection<byte[][]> lines) {
        if (userId == null) {
            return;
        }
        Instant now = clock.instant();
        for (byte[][] line : lines) {
            for (PreorderSubscription s : subs.lockLive(userId, line[0], line[1])) {
                boolean partlyUnused = s.statusEnum() == Status.HELD;
                s.close(Status.BOUGHT, null, now);
                s.setOrderId(orderId);
                subs.save(s);
                if (partlyUnused) {
                    products.findByIdForUpdate(line[0]).ifPresent(p -> {
                        holdsChanged(p);
                        handOut(p, Lines.variantById(p, line[1]), s.getBatchId(), Distribution.QUEUE_HOLD,
                                holdHours(s.getBatchId()), false);
                    });
                }
            }
        }
    }

    /**
     * Units came back to the shelf outside a batch (a cancelled order, a return «на склад», a smaller
     * quantity in an order): the queue gets them as holds, like after an arrival. Product row is locked.
     */
    public void onStockReturned(Product product, ProductVariant variant) {
        handOut(product, variant, null, Distribution.QUEUE_HOLD, holdHours(null), false);
    }

    /**
     * Units leave the shelf again outside checkout (a cancelled return takes them back into the order):
     * if the rest no longer covers the holds, the latest holds go back to waiting — their place in the
     * queue is kept. Product row is locked; {@code stockAfter} is what stays on the shelf.
     */
    public void onStockTaken(Product product, ProductVariant variant, int stockAfter) {
        List<PreorderSubscription> queue = subs.lockQueue(product.getId(), variant == null ? null : variant.getId());
        int held = queue.stream().filter(s -> s.statusEnum() == Status.HELD).mapToInt(PreorderSubscription::getHeldQty).sum();
        int over = held - Math.max(0, stockAfter);
        if (over > 0) {
            holdsChanged(product);
        }
        for (int i = queue.size() - 1; i >= 0 && over > 0; i--) {
            PreorderSubscription s = queue.get(i);
            if (s.statusEnum() != Status.HELD) {
                continue;
            }
            int back = Math.min(over, s.getHeldQty());
            over -= back;
            if (back == s.getHeldQty()) {
                s.setStatus(Status.WAITING.name());
                s.setHeldQty(0);
                s.setHoldUntil(null);
                s.setRemindedAt(null);
            } else {
                s.setHeldQty(s.getHeldQty() - back);
            }
        }
        subs.saveAll(queue);
    }

    // ---------------------------------------------------------------- hand-out

    /**
     * Hands the free units of a line to its queue. The caller holds the product row lock and has already
     * put the arrived units on the shelf. {@code tellShort} — also tell the people left without units
     * (after an arrival, not after a hold merely passed on).
     */
    public HandOut handOut(Product product, ProductVariant variant, Long batchId, Distribution mode, int holdHours,
                    boolean tellShort) {
        byte[] variantId = variant == null ? null : variant.getId();
        List<PreorderSubscription> queue = subs.lockQueue(product.getId(), variantId);
        int free = PreorderRules.free(Lines.stockOf(product, variant), seats(queue));
        if (queue.isEmpty() || free <= 0) {
            return new HandOut(0, 0, 0, 0, free);
        }
        Instant now = clock.instant();
        Instant until = now.plus(Duration.ofHours(Math.max(1, holdHours)));
        if (mode == Distribution.ALL_AT_ONCE) {
            int told = 0;
            for (PreorderSubscription s : queue) {
                if (s.statusEnum() == Status.WAITING) {
                    s.setStatus(Status.NOTIFIED.name());
                    s.setNotifiedAt(now);
                    s.setHoldUntil(until);
                    s.setBatchId(batchId);
                    told++;
                    events.publishEvent(new PreorderEvents.ArrivedNotice(s.getId()));
                }
            }
            subs.saveAll(queue);
            holdsChanged(product);
            return new HandOut(0, 0, told, 0, free);
        }
        PreorderRules.Allocation a = PreorderRules.allocate(seats(queue), free);
        Map<Long, PreorderSubscription> byId = new HashMap<>();
        queue.forEach(s -> byId.put(s.getId(), s));
        for (PreorderRules.Grant g : a.grants()) {
            PreorderSubscription s = byId.get(g.subscriptionId());
            s.setStatus(Status.HELD.name());
            s.setHeldQty(g.qty());
            s.setHoldUntil(until);
            s.setNotifiedAt(now);
            s.setRemindedAt(null);
            s.setBatchId(batchId);
            events.publishEvent(new PreorderEvents.HoldGranted(s.getId()));
        }
        if (tellShort && !a.grants().isEmpty()) {
            for (PreorderRules.Short sh : a.shorts()) {
                events.publishEvent(new PreorderEvents.StillWaiting(sh.subscriptionId(), sh.position()));
            }
        }
        subs.saveAll(queue);
        if (!a.grants().isEmpty()) {
            holdsChanged(product);
        }
        return new HandOut(a.grants().size(), a.grantedQty(), 0, a.shorts().size(), a.freeLeft());
    }

    /**
     * Holds of a product changed: drop the cached catalog and rebuild its site pages once the
     * transaction commits (before that another request would cache the old numbers again).
     */
    private void holdsChanged(Product product) {
        String slug = product.getSlug();
        Runnable flush = () -> {
            if (cacheManager != null) {
                for (String name : List.of("products", "productById")) {
                    Cache c = cacheManager.getCache(name);
                    if (c != null) {
                        c.clear();
                    }
                }
            }
            if (siteRevalidator != null) {
                siteRevalidator.productChanged(slug, null, null);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    flush.run();
                }
            });
        } else {
            flush.run();
        }
    }

    /** The same hand-out without touching anything — the «Приехала» preview. */
    public HandOut previewHandOut(byte[] productId, byte[] variantId, int stockAfter, Distribution mode) {
        List<PreorderSubscription> queue = subs.queue(productId, variantId);
        List<PreorderRules.Seat> seats = seats(queue);
        int free = PreorderRules.free(stockAfter, seats);
        if (queue.isEmpty() || free <= 0) {
            return new HandOut(0, 0, 0, 0, free);
        }
        if (mode == Distribution.ALL_AT_ONCE) {
            int told = (int) queue.stream().filter(s -> s.statusEnum() == Status.WAITING).count();
            return new HandOut(0, 0, told, 0, free);
        }
        PreorderRules.Allocation a = PreorderRules.allocate(seats, free);
        return new HandOut(a.grants().size(), a.grantedQty(), 0, a.shorts().size(), a.freeLeft());
    }

    // ---------------------------------------------------------------- jobs

    /** Ends holds and notices past their deadline; held units pass to the next person. */
    @Transactional
    public int expireHolds() {
        Instant now = clock.instant();
        int done = 0;
        for (Object[] candidate : subs.findExpiredHoldIds(now, PageRequest.of(0, 50))) {
            // product lock first (like checkout), then the place itself, read fresh: a buyer who held the
            // lock before us may have bought the hold meanwhile — then there is nothing to expire
            Product product = products.findByIdForUpdate((byte[]) candidate[1]).orElse(null);
            PreorderSubscription s = subs.findForUpdate(((Number) candidate[0]).longValue()).orElse(null);
            if (s == null || !(s.statusEnum() == Status.HELD || s.statusEnum() == Status.NOTIFIED)
                    || s.getHoldUntil() == null || !s.getHoldUntil().isBefore(now)) {
                continue;
            }
            boolean wasHeld = s.statusEnum() == Status.HELD;
            s.close(Status.EXPIRED, wasHeld ? "бронь закончилась" : "не купил после уведомления", now);
            subs.save(s);
            events.publishEvent(new PreorderEvents.HoldExpired(s.getId()));
            done++;
            if (wasHeld && product != null) {
                holdsChanged(product);
                handOut(product, Lines.variantById(product, s.getVariantId()), s.getBatchId(), Distribution.QUEUE_HOLD,
                        holdHours(s.getBatchId()), false);
            }
        }
        return done;
    }

    /** One reminder per hold, {@link #REMIND_BEFORE} before it ends. */
    @Transactional
    public int remindHolds() {
        Instant now = clock.instant();
        List<PreorderSubscription> due = subs.findHoldsToRemind(now, now.plus(REMIND_BEFORE), PageRequest.of(0, 100));
        for (PreorderSubscription s : due) {
            s.setRemindedAt(now);
            events.publishEvent(new PreorderEvents.HoldEnding(s.getId()));
        }
        subs.saveAll(due);
        return due.size();
    }

    // ---------------------------------------------------------------- helpers (shared with the batch service)

    public int holdHours(Long batchId) {
        if (batchId != null) {
            Optional<PreorderBatch> b = batches.find(batchId);
            if (b.isPresent()) {
                return b.get().getHoldHours();
            }
        }
        return settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS);
    }

    int maxQty() {
        int antibot = settings.getInt(SettingsRegistry.ANTIBOT_MAX_QTY_PER_PRODUCT);
        return antibot > 0 ? antibot : DEFAULT_MAX_QTY;
    }

    /** ETA of the soonest open public batch per line. */
    private Map<String, EtaDto> openEtas() {
        Map<String, PreorderBatch> best = new HashMap<>();
        for (BatchCatalog.PublicLine row : batches.publicLines()) {
            PreorderBatchItem i = row.item();
            best.merge(Lines.key(i.getProductId(), i.getVariantId()), row.batch(), BatchEta::sooner);
        }
        LocalDate today = SHOP_ZONE.today(clock);
        Map<String, EtaDto> out = new HashMap<>();
        best.forEach((k, b) -> out.put(k, BatchCatalog.eta(b, today)));
        return out;
    }

    private EtaDto openEta(byte[] productId, byte[] variantId) {
        PreorderBatch best = null;
        for (BatchCatalog.PublicLine row : batches.publicLines(productId)) {
            if (Arrays.equals(row.item().getVariantId(), variantId)) {
                best = best == null ? row.batch() : BatchEta.sooner(best, row.batch());
            }
        }
        return best == null ? null : BatchCatalog.eta(best, SHOP_ZONE.today(clock));
    }

    MyPreorderDto toMine(PreorderSubscription s, Product p, EtaDto eta) {
        return toMine(s, p, eta, ContentLocale.normalize(LocaleContextHolder.getLocale()));
    }

    /** {@code lang}: the product and variant names come in it (uk/en translations; ru is the source). */
    MyPreorderDto toMine(PreorderSubscription s, Product p, EtaDto eta, String lang) {
        Integer position = null;
        if (s.statusEnum() == Status.WAITING) {
            position = (int) subs.countAhead(s.getProductId(), s.getVariantId(), s.getCreatedAt(), s.getId()) + 1;
        }
        ProductVariant v = Lines.variantById(p, s.getVariantId());
        String productId = UuidUtil.toString(s.getProductId());
        String variantId = s.getVariantId() == null ? null : UuidUtil.toString(s.getVariantId());
        TranslationService.Overlay overlay = translations == null ? null : translations.overlay(lang);
        String title = overlay == null ? p.getTitle()
                : overlay.text(TranslationEntityType.PRODUCT, productId, TranslationEntityType.TITLE, p.getTitle());
        String variantName = v == null ? null : overlay == null ? v.getName()
                : overlay.text(TranslationEntityType.VARIANT, variantId, TranslationEntityType.NAME, v.getName());
        return new MyPreorderDto(s.getId(), productId, variantId,
                title, p.getSlug(), Lines.imageOf(p), variantName, s.getQty(), s.getStatus(),
                position, s.getHeldQty(), s.getHoldUntil(), s.getCreatedAt(),
                s.statusEnum().live() ? eta : null);
    }

    Map<String, Product> productsOf(Collection<byte[]> ids) {
        Map<String, Product> out = new HashMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (Product p : products.findAllById(ids)) {
            out.put(UuidUtil.toString(p.getId()), p);
        }
        return out;
    }

    static List<PreorderRules.Seat> seats(List<PreorderSubscription> queue) {
        return queue.stream()
                .map(s -> new PreorderRules.Seat(s.getId(), s.statusEnum(), s.getQty(), s.getHeldQty()))
                .toList();
    }

    /** The variant the customer picked; required when the product has variants, refused when it has none. */
    ProductVariant variantOf(Product p, String variantIdText) {
        boolean hasVariants = p.getVariants() != null && !p.getVariants().isEmpty();
        if (variantIdText == null || variantIdText.isBlank()) {
            if (hasVariants) {
                throw PreorderErrors.badRequest(messages.current("api.preorder.variantRequired", p.getTitle()));
            }
            return null;
        }
        ProductVariant v = hasVariants ? Lines.variantById(p, bytes(variantIdText)) : null;
        if (v == null) {
            throw PreorderErrors.badRequest(messages.current("api.preorder.variantRequired", p.getTitle()));
        }
        return v;
    }

    public static byte[] bytes(String uuid) {
        if (uuid == null || uuid.isBlank()) {
            throw PreorderErrors.badRequest("productId обязателен");
        }
        try {
            return UuidUtil.toBytes(uuid.trim());
        } catch (IllegalArgumentException e) {
            throw PreorderErrors.badRequest("Неверный id: " + uuid);
        }
    }
}
