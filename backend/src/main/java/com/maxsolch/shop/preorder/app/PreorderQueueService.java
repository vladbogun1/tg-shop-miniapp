package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.preorder.domain.PreorderError;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderRules;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.procurement.domain.BatchQueue.HandOut;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.BatchDtos.EtaDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.MyPreorderDto;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscribeRequest;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
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

    static final List<String> LIVE = List.of(Status.WAITING.name(), Status.HELD.name(), Status.NOTIFIED.name());
    /** Queue size when the anti-hoarding limit is off. */
    static final int DEFAULT_MAX_QTY = 10;

    private final PreorderSubscriptionRepository subs;
    private final BatchCatalog batches;
    private final Products products;
    private final SettingsService settings;
    private final DomainEvents events;
    private final Messages messages;
    /** The customer's card of a place (title, ETA, position). */
    private final PreorderCards cards;
    private final Clock clock;

    public PreorderQueueService(PreorderSubscriptionRepository subs, BatchCatalog batches, Products products,
                                SettingsService settings, DomainEvents events, Messages messages,
                                PreorderCards cards, Clock clock) {
        this.subs = subs;
        this.batches = batches;
        this.products = products;
        this.settings = settings;
        this.events = events;
        this.messages = messages;
        this.cards = cards;
        this.clock = clock;
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
                .orElseThrow(() -> new DomainException.NotFound(PreorderError.WAITING_NOT_FOUND));
        if (!product.isActive() || product.isArchived()) {
            throw new DomainException.BadRequest(PreorderError.PRODUCT_UNAVAILABLE, product.getTitle());
        }
        ProductVariant variant = variantOf(product, req.variantId());
        byte[] variantId = variant == null ? null : variant.getId();

        int maxQty = maxQty();
        int qty = req.qty() == null ? 1 : req.qty();
        if (qty < 1 || qty > maxQty) {
            throw new DomainException.BadRequest(PreorderError.QUANTITY_OUT_OF_RANGE, maxQty);
        }

        Optional<PreorderSubscription> existing = subs.findLive(userId, productId, variantId).stream().findFirst();
        if (existing.isPresent()) {
            PreorderSubscription s = existing.get();
            if (s.statusEnum() == Status.WAITING && s.getQty() != qty) {
                s.setQty(qty);
                subs.save(s);
            }
            return cards.toMine(s, product, cards.openEta(productId, variantId));
        }

        List<PreorderSubscription> queue = subs.queue(productId, variantId);
        if (PreorderRules.free(Lines.stockOf(product, variant), seats(queue)) > 0) {
            throw new DomainException.BadRequest(PreorderError.IN_STOCK);
        }
        EtaDto eta = cards.openEta(productId, variantId);
        if (eta == null && !settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)) {
            throw new DomainException.BadRequest(PreorderError.PRODUCT_UNAVAILABLE, product.getTitle());
        }
        int maxActive = settings.getInt(SettingsRegistry.PREORDER_MAX_ACTIVE);
        if (maxActive > 0 && subs.countByUserIdAndStatusIn(userId, LIVE) >= maxActive) {
            throw new DomainException.BadRequest(PreorderError.TOO_MANY, maxActive);
        }

        PreorderSubscription s = new PreorderSubscription();
        s.setUserId(userId);
        s.setProductId(productId);
        s.setVariantId(variantId);
        s.setQty(qty);
        s.setSource(SOURCE_WEB.equals(source) ? SOURCE_WEB : SOURCE_MINIAPP);
        s.setCreatedAt(clock.instant());
        PreorderSubscription saved = subs.save(s);
        events.publish(new PreorderEvents.Subscribed(saved.getId()));
        return cards.toMine(saved, product, eta);
    }

    /** Leaves a queue. A held unit goes to the next person at once. */
    @Transactional
    public void unsubscribe(long userId, long id) {
        PreorderSubscription s = subs.findById(id)
                .filter(x -> x.getUserId() == userId)
                .orElseThrow(() -> new DomainException.NotFound(PreorderError.WAITING_NOT_FOUND));
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
            events.publish(new PreorderEvents.Closed(s.getId(), "PRODUCT_GONE"));
            n++;
        }
        return n;
    }

    // ---------------------------------------------------------------- checkout

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
                    events.publish(new PreorderEvents.ArrivedNotice(s.getId()));
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
            events.publish(new PreorderEvents.HoldGranted(s.getId()));
        }
        if (tellShort && !a.grants().isEmpty()) {
            for (PreorderRules.Short sh : a.shorts()) {
                events.publish(new PreorderEvents.StillWaiting(sh.subscriptionId(), sh.position()));
            }
        }
        subs.saveAll(queue);
        if (!a.grants().isEmpty()) {
            holdsChanged(product);
        }
        return new HandOut(a.grants().size(), a.grantedQty(), 0, a.shorts().size(), a.freeLeft());
    }

    /**
     * Holds of a product changed: the catalog shows stock minus holds, so its cache and the site pages are
     * rebuilt once the transaction commits ({@link HoldsCacheFlush}).
     */
    void holdsChanged(Product product) {
        events.publish(new PreorderEvents.HoldsChanged(product.getSlug()));
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
                throw new DomainException.BadRequest(PreorderError.VARIANT_REQUIRED, p.getTitle());
            }
            return null;
        }
        ProductVariant v = hasVariants ? Lines.variantById(p, bytes(variantIdText)) : null;
        if (v == null) {
            throw new DomainException.BadRequest(PreorderError.VARIANT_REQUIRED, p.getTitle());
        }
        return v;
    }

    public static byte[] bytes(String uuid) {
        if (uuid == null || uuid.isBlank()) {
            throw new DomainException.BadRequest(PreorderError.PRODUCT_ID_REQUIRED);
        }
        try {
            return UuidUtil.toBytes(uuid.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(PreorderError.INVALID_ID, uuid);
        }
    }
}
