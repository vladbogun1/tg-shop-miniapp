package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.PromoDiscount;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.order.domain.RejectCause;
import com.maxsolch.shop.service.OrderStock;
import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.cart.domain.CartRules;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.gift.CaseLowMargin;
import com.maxsolch.shop.gift.GiftCaseTier;
import com.maxsolch.shop.gift.GiftRegistryService;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.gift.OrderGiftCase;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.CancelRequestStatus;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMessage;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Order lifecycle and business rules: stock, promo, delivery/payment snapshots, status transitions.
 *
 * <p>Telegram notifications are not sent from here: the service publishes {@link OrderEvents} and
 * {@code OrderNotificationListener} delivers them after the transaction commits, so no database
 * connection or stock row lock is ever held across a network call to Telegram.
 */
@Slf4j
@Service
public class OrderService {

    /**
     * Error code for "this promo code cannot be used". The cart validates codes before checkout, so
     * reaching this means the last use was taken in the meantime — the app drops the code and lets
     * the customer place the order at the price it then shows, instead of dead-ending them.
     */
    public static final String PROMO_REJECTED = "PROMO_REJECTED";

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final PromoCodeRepository promoCodeRepository;
    private final PaymentOptionRepository paymentOptionRepository;
    private final ApplicationEventPublisher events;
    private final PromoService promoService;
    private final CartService cartService;
    private final Messages messages;
    private final EntityManager entityManager;
    private final OrderStock stock;
    /** The order money journal: every movement of money on an order is recorded here. */
    private final MoneyLedger moneyLedger;
    /** Money received on an order: a manual order may be created already paid. */
    private final OrderPayments payments;
    /** The gift for the order sum / the gift case. */
    private final GiftService giftService;
    /** Gifts already given to a person this month. */
    private final GiftRegistryService giftRegistry;
    /** Low-margin products of the gift case. */
    private final CaseLowMargin caseLowMargin;

    /** Hours a new order may stay unpaid online before it is rejected (app.payment.due-hours). */
    @org.springframework.beans.factory.annotation.Value("${app.payment.due-hours:24}")
    private int paymentDueHours = 24;

    private void ledger(Order order, OrderMoneyMovement.Kind kind, OrderMoneyMovement.Channel channel, long amountMinor,
                        OrderMoneyMovement.Source source, String adminName, String note, String invoiceExtId) {
        if (amountMinor != 0) {
            moneyLedger.record(order.getId(), kind, channel, amountMinor, source, adminName, note, invoiceExtId);
        }
    }

    public OrderService(OrderRepository orderRepository,
                        ProductRepository productRepository,
                        PromoCodeRepository promoCodeRepository,
                        PaymentOptionRepository paymentOptionRepository,
                        ApplicationEventPublisher events,
                        PromoService promoService,
                        CartService cartService,
                        Messages messages,
                        EntityManager entityManager,
                        OrderStock stock,
                        MoneyLedger moneyLedger,
                        OrderPayments payments,
                        GiftService giftService,
                        GiftRegistryService giftRegistry,
                        CaseLowMargin caseLowMargin) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.promoCodeRepository = promoCodeRepository;
        this.paymentOptionRepository = paymentOptionRepository;
        this.events = events;
        this.promoService = promoService;
        this.cartService = cartService;
        this.messages = messages;
        this.entityManager = entityManager;
        this.stock = stock;
        this.moneyLedger = moneyLedger;
        this.payments = payments;
        this.giftService = giftService;
        this.giftRegistry = giftRegistry;
        this.caseLowMargin = caseLowMargin;
    }

    /**
     * Validate availability + variants, resolve/apply promo (fixed beats percent), decrement
     * stock (variant + product rollup), snapshot delivery & payment, persist with status NEW,
     * then notify (channel card + optional customer DM).
     */
    @Transactional
    public Order createOrder(CreateOrderCommand cmd) {
        if (cmd.items() == null || cmd.items().isEmpty()) {
            throw new BadRequestException(messages.current("api.order.noItems"));
        }

        DeliveryMethod deliveryMethod = parseDelivery(cmd.deliveryMethod());

        // Accumulate duplicate (productId, variantId) lines into a single requested quantity.
        Map<String, AccLine> acc = new LinkedHashMap<>();
        for (CreateOrderCommand.Line line : cmd.items()) {
            if (line.quantity() <= 0) {
                throw new BadRequestException(messages.current("api.order.quantityPositive"));
            }
            String key = line.productId() + "::" + (line.variantId() == null ? "" : line.variantId());
            acc.computeIfAbsent(key, k -> new AccLine(line.productId(), line.variantId()))
                    .quantity += line.quantity();
        }

        Order order = new Order();
        order.setCurrency("UAH");
        order.setCustomerName(required(cmd.customerName(), "customerName"));
        order.setPhone(required(cmd.phone(), "phone"));
        order.setComment(cmd.comment());
        order.setUserId(cmd.userId());
        order.setTgUserId(cmd.tgUserId());
        order.setTgUsername(cmd.tgUsername());
        order.setSource(cmd.source() == null ? OrderSource.MINIAPP : cmd.source());

        order.setDeliveryMethod(deliveryMethod);
        if (deliveryMethod == DeliveryMethod.NOVA_POSHTA) {
            order.setNpCityRef(cmd.npCityRef());
            order.setNpCityName(cmd.npCityName());
            order.setNpWarehouseRef(cmd.npWarehouseRef());
            order.setNpWarehouseName(cmd.npWarehouseName());
        }

        // Payment option snapshot. Every option is paid online now (in full, or a prepayment with
        // the rest cash on delivery), so one must be chosen; the clock to pay starts here.
        if (cmd.paymentOptionId() == null || cmd.paymentOptionId().isBlank()) {
            throw new BadRequestException(messages.current("api.order.paymentRequired"));
        }
        PaymentOption po = paymentOptionRepository.findById(toBytes(cmd.paymentOptionId(), "paymentOptionId"))
                .filter(PaymentOption::isActive)
                .orElseThrow(() -> new BadRequestException(messages.current("api.order.paymentUnknown")));
        order.setPaymentOptionId(po.getId());
        order.setPaymentOptionTitle(po.getTitle());
        order.setPrepaymentMinor(po.isRequiresPrepayment() ? po.getPrepaymentMinor() : 0);
        order.setPaymentDueAt(Instant.now().plus(java.time.Duration.ofHours(Math.max(1, paymentDueHours))));

        long subtotal = 0;
        List<Product> toSave = new ArrayList<>();
        // Lock products in a deterministic order (by id): two concurrent orders touching the same
        // pair of products would otherwise be able to deadlock against each other.
        List<AccLine> lines = new ArrayList<>(acc.values());
        lines.sort(Comparator.comparing(l -> l.productId));
        // The gift for the order sum is locked in the same id order, up front: taking its row after
        // the cart's could deadlock with an order that has the gift product in its cart.
        // An exchange replacement (CHOICE_NONE) earns no gift: the goods were paid for in the first order.
        Optional<GiftService.GiftConfig> giftCfg = GiftService.CHOICE_NONE.equalsIgnoreCase(String.valueOf(cmd.giftChoice()))
                ? Optional.empty() : giftService.giftConfig();
        Map<String, Optional<Product>> locked = new HashMap<>();
        java.util.SortedSet<String> lockIds = new java.util.TreeSet<>();
        lines.forEach(l -> lockIds.add(l.productId));
        giftCfg.ifPresent(g -> lockIds.addAll(g.productIds()));
        for (String id : lockIds) {
            // FOR UPDATE: the stock check and the decrement below must not interleave with another
            // checkout, or both orders pass "one left in stock" and the shop oversells.
            locked.put(id, productRepository.findByIdForUpdate(toBytes(id, "productId")));
        }
        for (AccLine line : lines) {
            Product product = locked.get(line.productId)
                    .orElseThrow(() -> new BadRequestException(messages.current("api.order.productUnknown")));
            if (!product.isActive() || product.isArchived()) {
                throw new BadRequestException(messages.current("api.order.unavailable", product.getTitle()));
            }

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setTitleSnapshot(product.getTitle());
            item.setPriceMinorSnapshot(product.getPriceMinor());
            item.setQuantity(line.quantity);

            boolean hasVariants = product.getVariants() != null && !product.getVariants().isEmpty();
            ProductVariant variant = null;
            if (line.variantId != null && !line.variantId.isBlank()) {
                variant = findVariant(product, line.variantId);
                if (variant == null) {
                    throw new BadRequestException(messages.current("api.order.variantMismatch", product.getTitle()));
                }
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            } else if (hasVariants) {
                throw new BadRequestException(messages.current("api.order.variantRequired", product.getTitle()));
            }
            stock.requireAvailable(product, variant, line.quantity, cmd.userId());
            stock.reserve(product, variant, line.quantity, item);

            subtotal += product.getPriceMinor() * (long) line.quantity;
            order.getItems().add(item);
            toSave.add(product);
        }

        // Promo: fixed amount takes priority over percent.
        long discount = 0;
        PromoCode promo = resolvePromo(cmd.promoCode(), cmd.tgUserId(), true);
        long lowMarginMinor = lowMarginMinor(order);
        if (promo != null) {
            discount = PromoDiscount.discountFor(promo, subtotal, promoExcluded(promo, lowMarginMinor, subtotal));
            order.setPromoCode(promo.getCode());
            promo.setUsesCount(promo.getUsesCount() + 1);
            promoCodeRepository.save(promo);
            if (cmd.tgUserId() != null) {
                // The use is counted on the code now; leaving the hold in place would block one
                // more use for the rest of the half hour.
                promoService.consume(promo.getId(), cmd.tgUserId());
            }
        }

        order.setSubtotalMinor(subtotal);
        order.setDiscountMinor(discount);
        order.setTotalMinor(OrderMoney.totalMinor(subtotal, discount));

        // The gift for the order sum (docs/GIFT-CASE.md), against the total after the discount: the
        // tier's guaranteed discount (the customer's choice) or its case — the prize is drawn now.
        boolean lowMargin = lowMarginMinor > 0;
        OrderGiftCase drawn = giftCfg.map(g -> applyThresholdGift(order, g, cmd.giftChoice(), locked, toSave, lowMargin))
                .orElse(null);

        order.settleIfFree(Instant.now());

        productRepository.saveAll(toSave);
        Order saved = orderRepository.save(order);
        stock.onOrderPlaced(cmd.userId(), saved);
        if (drawn != null) {
            drawn.setOrderId(saved.getId());
            giftService.saveOrderCase(drawn);
        }

        // The ordered lines leave the customer's server cart in the same transaction, so every
        // device sees them gone at once — and a failed order leaves the cart untouched.
        if (cmd.userId() != null) {
            cartService.removeOrdered(cmd.userId(), saved.getItems().stream()
                    .map(i -> CartRules.LineKey.of(i.getProductId(), i.getVariantId()))
                    .toList());
        }

        // Telegram is contacted only after this transaction commits (see
        // OrderNotificationListener): otherwise the DB connection and the stock row locks stay
        // held for the whole API round trip, and a customer could be told about an order that
        // then failed to save.
        events.publishEvent(new OrderEvents.Created(saved.getId()));
        return saved;
    }

    /**
     * A sale the admin types in (V68): the checkout rules, source ADMIN, no payment deadline (the
     * admin agreed on the payment with the buyer), and what was already received goes to the money
     * journal with its channel.
     */
    @Transactional
    public Order createAdminOrder(CreateOrderCommand cmd, long paidMinor, OrderMoneyMovement.Channel channel,
                                  String adminName, String note) {
        Order order = createOrder(cmd);
        order.setPaymentDueAt(null);
        orderRepository.save(order);
        if (paidMinor > 0) {
            return payments.markPaid(order.getId(), paidMinor, channel, adminName,
                    note == null || note.isBlank() ? "оплата при ручном заказе" : note);
        }
        return order;
    }

    /**
     * Payment option of an exchange replacement: the original order's while it is still offered,
     * otherwise the first active one (the rest of a dearer replacement is collected through it).
     */
    public String exchangePaymentOptionId(Order original) {
        if (original.getPaymentOptionId() != null) {
            Optional<PaymentOption> po = paymentOptionRepository.findById(original.getPaymentOptionId())
                    .filter(PaymentOption::isActive);
            if (po.isPresent()) {
                return UuidUtil.toString(po.get().getId());
            }
        }
        return paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .findFirst()
                .map(po -> UuidUtil.toString(po.getId()))
                .orElseThrow(() -> new BadRequestException("нет активного способа оплаты для нового заказа"));
    }

    @Transactional(readOnly = true)
    public Order get(byte[] orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
    }

    /**
     * The order, row-locked ({@code SELECT ... FOR UPDATE}) for the rest of the transaction, with
     * its state as of AFTER the lock was granted.
     *
     * <p>The refresh matters: with open-in-view the request's persistence context usually already
     * holds this order (the controller loaded it to check access/existence), and a locking query
     * then hands back that cached instance untouched. Two concurrent rejects would both still see
     * {@code NEW} after waiting for each other's lock — and both return the stock. Refreshing with
     * the lock re-reads the committed row.
     */
    /**
     * Loads the order under a row lock (SELECT … FOR UPDATE) and refreshes it, so concurrent
     * admin / customer actions on one order run one after another. Package-private: also used by
     * {@link OrderAdjustmentService}.
     */
    Order lock(byte[] orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
        entityManager.refresh(order, LockModeType.PESSIMISTIC_WRITE);
        return order;
    }

    // ----- admin order editing: gifts & discounts -----

    /** Admin adds a FREE gift product to an order: stock is decremented (unit is reserved),
     *  the item is added at price 0 (so total/наложка don't change), gifts merge by product+variant. */
    @Transactional
    public Order addItem(byte[] orderId, String productId, String variantId, int qty,
                         boolean gift, boolean notifyCustomer) {
        Order order = lock(orderId);
        order.requireEditable();
        if (qty < 1) {
            throw new BadRequestException("quantity must be >= 1");
        }
        // Locked: this path mutates stock too (an admin adding a gift reserves real units).
        Product product = productRepository.findByIdForUpdate(toBytes(productId, "productId"))
                .orElseThrow(() -> new BadRequestException("unknown product: " + productId));
        if (product.isArchived()) {
            throw new BadRequestException("product is archived: " + product.getTitle());
        }
        boolean hasVariants = product.getVariants() != null && !product.getVariants().isEmpty();
        ProductVariant variant = null;
        if (hasVariants) {
            if (variantId == null || variantId.isBlank()) {
                throw new BadRequestException("variant is required for product: " + product.getTitle());
            }
            variant = findVariant(product, variantId);
            if (variant == null) {
                throw new BadRequestException("variant does not belong to product: " + variantId);
            }
        }
        byte[] vId = variant == null ? null : variant.getId();
        OrderItem existing = order.getItems().stream()
                .filter(i -> i.isGift() == gift)
                .filter(i -> java.util.Arrays.equals(i.getProductId(), product.getId()))
                .filter(i -> java.util.Arrays.equals(i.getVariantId(), vId))
                .findFirst().orElse(null);
        OrderItem item = existing != null ? existing : new OrderItem();
        stock.reserve(product, variant, qty, item);
        if (existing != null) {
            existing.setQuantity(existing.getQuantity() + qty);
        } else {
            item.setOrder(order);
            item.setProductId(product.getId());
            item.setTitleSnapshot(product.getTitle());
            item.setPriceMinorSnapshot(gift ? 0 : product.getPriceMinor());
            item.setQuantity(qty);
            item.setGift(gift);
            item.setGiftValueMinor(gift ? product.getPriceMinor() : 0);
            if (variant != null) {
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            }
            order.getItems().add(item);
        }
        productRepository.save(product);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.Edited(
                saved.getId(),
                gift ? OrderEvents.EditKind.GIFT : OrderEvents.EditKind.COMPOSITION,
                notifyCustomer,
                product.getTitle(),
                variant == null ? null : variant.getName(),
                qty));
        return saved;
    }

    /** Admin removes an order item (a gift or a line), restoring its stock and recomputing totals. */
    @Transactional
    public Order removeItem(byte[] orderId, long itemId) {
        Order order = lock(orderId);
        order.requireEditable();
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("order item not found"));
        stock.restoreLine(item);
        order.getItems().remove(item);
        if (item.isAutoGift() && item.getCaseRarity() != null) {
            // The case prize is gone: no case left to open.
            order.setGiftCaseStatus(null);
            order.setGiftCaseOpenedAt(null);
            if (order.getGiftDiscountMinor() <= 0) {
                order.setGiftTier(null);
            }
            giftService.deleteOrderCase(order.getId());
        }
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** Admin changes an item's quantity, reserving/releasing stock by the delta. */
    @Transactional
    public Order changeItemQuantity(byte[] orderId, long itemId, int newQty, boolean notifyCustomer) {
        Order order = lock(orderId);
        order.requireEditable();
        if (newQty < 1) {
            throw new BadRequestException("quantity must be >= 1 (use remove to delete)");
        }
        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("order item not found"));
        int delta = newQty - item.getQuantity();
        if (delta != 0) {
            stock.resizeLine(item, delta);
        }
        item.setQuantity(newQty);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.COMPOSITION, notifyCustomer));
        return saved;
    }

    /** Admin applies / updates / removes a discount: an existing promo code, or a manual amount/percent. */
    @Transactional
    public Order applyDiscount(byte[] orderId, String promoCode, Long amountMinor,
                               Integer percent, boolean clear, boolean notifyCustomer) {
        Order order = lock(orderId);
        order.requireEditable();
        long subtotal = order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();

        // Release any previous REAL promo usage before re-applying.
        releasePromoUsage(order.getPromoCode());

        long discount = 0;
        if (clear) {
            order.setPromoCode(null);
        } else if (promoCode != null && !promoCode.isBlank()) {
            // An admin applying a code by hand is a deliberate decision, so customers' half-hour
            // holds do not stand in their way — only the code's own usage limit does.
            // The order's customer is passed for the owner check of personal codes (V44).
            PromoCode p = resolvePromo(promoCode, order.getUserId(), false);
            discount = PromoDiscount.discountFor(p, subtotal, promoExcluded(p, lowMarginMinor(order), subtotal));
            p.setUsesCount(p.getUsesCount() + 1);
            promoCodeRepository.save(p);
            order.setPromoCode(p.getCode());
        } else if (amountMinor != null && amountMinor > 0) {
            discount = Math.min(amountMinor, subtotal);
            order.setPromoCode("Ручная скидка");
        } else if (percent != null && percent > 0) {
            int pc = Math.min(percent, 100);
            discount = subtotal * pc / 100;
            order.setPromoCode("Ручная скидка " + pc + "%");
        } else {
            order.setPromoCode(null);
        }

        order.setSubtotalMinor(subtotal);
        // The guaranteed discount of the gift case stays: the customer chose it instead of a case.
        order.setDiscountMinor(Math.min(Math.max(0, discount) + Math.max(0, order.getGiftDiscountMinor()), subtotal));
        order.setGiftDiscountMinor(Math.min(order.getGiftDiscountMinor(), order.getDiscountMinor()));
        order.setTotalMinor(OrderMoney.totalMinor(subtotal, order.getDiscountMinor()));
        order.settleIfFree(Instant.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(
                saved.getId(), OrderEvents.EditKind.DISCOUNT, notifyCustomer));
        return saved;
    }

    // ----- helpers -----

    /** Package-private twin of {@link #recomputeTotals} for {@link OrderAdjustmentService}. */
    void recomputeOrderTotals(Order order) {
        recomputeTotals(order);
    }

    /** Recompute subtotal from items; keep the stored (absolute) discount capped at subtotal. */
    private void recomputeTotals(Order order) {
        OrderMoney.reprice(order);
        order.settleIfFree(Instant.now());
    }

    /**
     * The gift for the order sum (settings «Подарок за сумму (кейсы)»): one unit at price 0, the
     * variant with the most stock. Out of stock or hidden — the order simply goes without it.
     */
    private boolean addThresholdGift(Order order, Product product, List<Product> toSave, String caseRarity) {
        if (!giftable(product)) {
            return false;
        }
        ProductVariant variant = null;
        if (product.getVariants() != null && !product.getVariants().isEmpty()) {
            variant = product.getVariants().stream()
                    .filter(v -> v.getStock() > 0)
                    .max(Comparator.comparingInt(ProductVariant::getStock))
                    .orElseThrow();
        }
        OrderItem item = new OrderItem();
        stock.reserve(product, variant, 1, item);
        item.setOrder(order);
        item.setProductId(product.getId());
        item.setTitleSnapshot(product.getTitle());
        item.setPriceMinorSnapshot(0);
        item.setQuantity(1);
        item.setGift(true);
        item.setGiftValueMinor(product.getPriceMinor());
        item.setAutoGift(true);
        item.setCaseRarity(caseRarity);
        if (variant != null) {
            item.setVariantId(variant.getId());
            item.setVariantNameSnapshot(variant.getName());
            // A case prize with a choice of sizes: the fullest one is held until the customer picks theirs.
            ProductVariant held = variant;
            item.setVariantPending(caseRarity != null
                    && product.getVariants().stream().anyMatch(v -> v != held && v.getStock() > 0));
        }
        order.getItems().add(item);
        toSave.add(product);
        return true;
    }

    /** Can be given away now: visible, and a unit (of some variant) in stock. */
    private static boolean giftable(Product product) {
        if (!product.isActive() || product.isArchived()) {
            return false;
        }
        if (product.getVariants() != null && !product.getVariants().isEmpty()) {
            return product.getVariants().stream().anyMatch(v -> v.getStock() > 0);
        }
        return product.getStock() > 0;
    }

    private static final java.security.SecureRandom CASE_RANDOM = new java.security.SecureRandom();

    /**
     * The gift of a new order: walks the tiers its total reaches, dearest first. The customer took the
     * guaranteed discount ({@code choice} DISCOUNT, the tier offers one) — it comes off this order and
     * there is no case. Otherwise a prize of the tier is drawn among those that can drop (a cheaper
     * tier when none can). Without a case the single gift product is the fallback.
     *
     * @return the prize record to save once the order has its id; null = no case
     */
    private OrderGiftCase applyThresholdGift(Order order, GiftService.GiftConfig g, String choice,
                                             Map<String, Optional<Product>> locked, List<Product> toSave,
                                             boolean lowMargin) {
        long total = order.getTotalMinor();
        List<GiftService.TierConfig> reached = g.reached(total);
        if (!reached.isEmpty() && GiftService.CHOICE_DISCOUNT.equalsIgnoreCase(String.valueOf(choice))) {
            GiftService.TierConfig top = reached.get(0);
            long d = top.guaranteedDiscountMinor(total);
            if (d > 0) {
                order.setGiftTier(top.tier().name());
                order.setGiftDiscountMinor(d);
                order.setDiscountMinor(Math.min(order.getSubtotalMinor(), order.getDiscountMinor() + d));
                order.setTotalMinor(OrderMoney.totalMinor(order.getSubtotalMinor(), order.getDiscountMinor()));
                return null;
            }
        }
        long left = giftLimitLeft(order);
        java.util.function.Predicate<String> giftable = giftableWithin(locked, left);
        for (GiftService.TierConfig tier : reached) {
            // An order with a low-margin product: product prizes drop rarer, discounts on the next order more often.
            Optional<GiftService.CaseEntry> prize = GiftService.draw(tier.prizes(), giftable, CASE_RANDOM,
                    tier.productPercent(lowMargin));
            if (prize.isPresent()) {
                OrderGiftCase rec = placeCasePrize(order, tier.tier(), prize.get(), locked, toSave);
                if (rec != null) {
                    rec.setLowMargin(lowMargin && tier.lowMarginProductPercent() < 100);
                    return rec;
                }
            }
        }
        if (g.productId() != null && total >= g.thresholdMinor()) {
            locked.getOrDefault(g.productId(), Optional.empty())
                    .filter(p -> p.getPriceMinor() <= left)
                    .ifPresent(p -> addThresholdGift(order, p, toSave, null));
        }
        return null;
    }

    private static java.util.function.Predicate<String> giftableIn(Map<String, Optional<Product>> locked) {
        return id -> id != null && locked.getOrDefault(id, Optional.empty()).filter(OrderService::giftable).isPresent();
    }

    /**
     * What is left of the monthly gift limit of the order's person (docs/GIFT-CASE.md, «Реестр подарков
     * и месячный лимит»), kopecks; {@link Long#MAX_VALUE} without a limit.
     */
    private long giftLimitLeft(Order order) {
        return giftRegistry.remainingMinor(GiftRegistryService.Person.of(order), Instant.now());
    }

    /**
     * A product can be given: giftable and no dearer than {@code left} — a product prize over the limit
     * does not drop, the draw picks among the rest (discounts always can).
     */
    private static java.util.function.Predicate<String> giftableWithin(Map<String, Optional<Product>> locked, long left) {
        return giftableIn(locked).and(id -> locked.get(id).map(p -> p.getPriceMinor() <= left).orElse(false));
    }

    /** Seals the drawn prize into the order: a product goes in as a line at price 0, a discount waits for the opening. */
    private OrderGiftCase placeCasePrize(Order order, GiftCaseTier.Tier tier, GiftService.CaseEntry prize,
                                         Map<String, Optional<Product>> locked, List<Product> toSave) {
        String title = null;
        if (!prize.isDiscount()) {
            Product p = locked.getOrDefault(prize.productId(), Optional.empty()).orElse(null);
            if (p == null || !addThresholdGift(order, p, toSave, prize.rarity())) {
                return null;
            }
            title = p.getTitle();
        }
        order.setGiftTier(tier.name());
        order.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_SEALED);
        order.setGiftCaseOpenedAt(null);
        return GiftService.record(order.getId(), prize, title);
    }

    /**
     * Customer opens the gift case of their order: SEALED → OPENED, exactly once. Only a paid order
     * (the online part arrived) — otherwise a customer could order, peek and cancel. The prize was
     * drawn by the server before (checkout / admin), opening only reveals it.
     */
    @Transactional
    public Order openGiftCase(byte[] orderId) {
        Order order = lock(orderId);
        if (order.getGiftCaseStatus() == null) {
            throw new BadRequestException(messages.current("api.giftCase.none"), GiftCaseRules.GIFT_CASE_NONE);
        }
        if (GiftCaseRules.GIFT_CASE_OPENED.equals(order.getGiftCaseStatus())) {
            throw new BadRequestException(messages.current("api.giftCase.alreadyOpened"), GiftCaseRules.GIFT_CASE_ALREADY_OPENED);
        }
        if (!GiftCaseRules.giftCaseOpenable(order)) {
            throw new BadRequestException(messages.current("api.giftCase.unpaid"), GiftCaseRules.GIFT_CASE_UNPAID);
        }
        order.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_OPENED);
        order.setGiftCaseOpenedAt(Instant.now());
        return orderRepository.save(order);
    }

    /**
     * The customer swaps the opened case's product prize for a code (GiftCaseService decides whether
     * it is similar and what it is worth): the line leaves the order and its unit goes back to stock.
     */
    @Transactional
    public Order removeCasePrizeForSwap(byte[] orderId) {
        Order order = lock(orderId);
        if (!GiftCaseRules.giftCaseSwappable(order)) {
            throw new BadRequestException(messages.current("api.giftCase.swapUnavailable"), GiftCaseRules.GIFT_CASE_SWAP_UNAVAILABLE);
        }
        OrderItem item = GiftCaseRules.casePrizeLine(order).orElseThrow();
        stock.restoreLine(item);
        order.getItems().remove(item);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** A size the customer may pick for the case prize: in stock, or the one held for them now. */
    public record PrizeSize(String variantId, String name, boolean current) {
    }

    /**
     * Sizes of the case prize line to choose from (empty when the prize has none): the one held now and
     * every other one in stock, in the product's order.
     */
    @Transactional(readOnly = true)
    public List<PrizeSize> casePrizeSizes(Order order) {
        OrderItem line = GiftCaseRules.casePrizeLine(order).orElse(null);
        if (line == null || line.getVariantId() == null) {
            return List.of();
        }
        Product product = productRepository.findById(line.getProductId()).orElse(null);
        if (product == null || product.getVariants() == null) {
            return List.of();
        }
        return product.getVariants().stream()
                .sorted(Comparator.comparingInt(ProductVariant::getSortOrder))
                .filter(v -> v.getStock() > 0 || java.util.Arrays.equals(v.getId(), line.getVariantId()))
                .map(v -> new PrizeSize(UuidUtil.toString(v.getId()), v.getName(),
                        java.util.Arrays.equals(v.getId(), line.getVariantId())))
                .toList();
    }

    /**
     * The customer picks the size of the opened case's product prize while the order is still being put
     * together: the held unit goes back to stock and one of the chosen size is reserved instead. Picking
     * the held size just confirms it. 400 GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE when that size is gone.
     */
    @Transactional
    public Order chooseCasePrizeSize(byte[] orderId, String variantId) {
        Order order = lock(orderId);
        if (!GiftCaseRules.giftCaseSwappable(order)) {
            throw new BadRequestException(messages.current("api.giftCase.sizeUnavailable"), GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE);
        }
        OrderItem item = GiftCaseRules.casePrizeLine(order).orElseThrow();
        Product product = productRepository.findByIdForUpdate(item.getProductId()).orElse(null);
        ProductVariant target = product == null || variantId == null ? null : findVariant(product, variantId);
        if (target == null || item.getVariantId() == null) {
            throw new BadRequestException(messages.current("api.giftCase.sizeUnavailable"), GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE);
        }
        if (!java.util.Arrays.equals(target.getId(), item.getVariantId())) {
            if (target.getStock() < item.getQuantity()) {
                throw new BadRequestException(messages.current("api.giftCase.sizeUnavailable"), GiftCaseRules.GIFT_CASE_SIZE_UNAVAILABLE);
            }
            stock.moveLine(product, target, item);
            item.setVariantId(target.getId());
            item.setVariantNameSnapshot(target.getName());
        }
        item.setVariantPending(false);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        return saved;
    }

    /** The order locked for an update (the gift case reads and changes it in one transaction). */
    @Transactional
    public Order lockForGiftCase(byte[] orderId) {
        return lock(orderId);
    }

    /**
     * Admin gives a gift case of a tier to an order (any sum): the prize is drawn now among the tier's
     * prizes (products in stock, discounts) and sealed into the order; the customer opens it once the
     * order is paid.
     */
    @Transactional
    public Order grantGiftCase(byte[] orderId, GiftCaseTier.Tier tier, boolean notifyCustomer) {
        Order order = lock(orderId);
        order.requireEditable();
        if (order.getGiftCaseStatus() != null) {
            throw new BadRequestException("У заказа уже есть кейс");
        }
        GiftService.TierConfig cfg = giftService.tier(tier)
                .orElseThrow(() -> new BadRequestException("В этом кейсе нет призов — добавьте их в разделе «Кейс»"));
        // Prize rows locked in id order, like the checkout.
        Map<String, Optional<Product>> locked = new HashMap<>();
        for (String id : new java.util.TreeSet<>(cfg.prizes().stream().map(GiftService.CaseEntry::productId)
                .filter(java.util.Objects::nonNull).toList())) {
            locked.put(id, productRepository.findByIdForUpdate(toBytes(id, "productId")));
        }
        boolean lowMargin = hasLowMargin(order);
        GiftService.CaseEntry prize = GiftService.draw(cfg.prizes(), giftableWithin(locked, giftLimitLeft(order)),
                        CASE_RANDOM, cfg.productPercent(lowMargin))
                .orElseThrow(() -> new BadRequestException(
                        "Ни одного приза этого кейса нет в наличии или в пределах месячного лимита подарков покупателя"));
        List<Product> toSave = new ArrayList<>();
        OrderGiftCase rec = placeCasePrize(order, tier, prize, locked, toSave);
        if (rec == null) {
            throw new BadRequestException("Приз закончился — попробуйте ещё раз");
        }
        rec.setLowMargin(lowMargin && cfg.lowMarginProductPercent() < 100);
        productRepository.saveAll(toSave);
        recomputeTotals(order);
        Order saved = orderRepository.save(order);
        rec.setOrderId(saved.getId());
        giftService.saveOrderCase(rec);
        events.publishEvent(new OrderEvents.Edited(saved.getId(), OrderEvents.EditKind.GIFT_CASE, notifyCustomer,
                null, null, 1));
        return saved;
    }

    /** Decrement usesCount of a previously-applied REAL promo code (ignores manual-discount labels). */
    private void releasePromoUsage(String code) {
        if (code == null || code.isBlank()) {
            return;
        }
        // Locked like the checkout's increment, or the two could overwrite each other's count.
        promoCodeRepository.findByCodeForUpdate(code).ifPresent(p -> {
            if (p.getUsesCount() > 0) {
                p.setUsesCount(p.getUsesCount() - 1);
                promoCodeRepository.save(p);
            }
        });
    }

    /** The common tail of every reject, under the order lock: status, reason, then {@link #afterTransition}. */
    private Order rejectLocked(Order order, RejectCause cause) {
        order.reject(cause);
        return afterTransition(order);
    }

    /**
     * Persists a status transition and hands the Telegram side to the after-commit listener: it
     * moves the channel card, DMs the customer, and adds or removes the seller's dispatch card
     * depending on whether the order still awaits shipment.
     */
    private Order afterTransition(Order order) {
        if (order.getStatus() == OrderStatus.REJECTED) {
            // An unused code from the case (a discount prize, a swap) goes with the order.
            giftService.revokeCasePromo(order.getId());
        }
        Order saved = orderRepository.save(order);
        events.publishEvent(new OrderEvents.StatusChanged(saved.getId()));
        return saved;
    }

    private ProductVariant findVariant(Product product, String variantId) {
        return OrderStock.variantOf(product, toBytes(variantId, "variantId"));
    }

    /**
     * Resolves an active promo code and takes a row lock on it, so the "usage limit reached" check
     * and the {@code usesCount++} that follows in the caller are atomic with respect to other
     * checkouts. Without the lock a code limited to one use could be redeemed by several
     * simultaneous orders.
     */
    private PromoCode resolvePromo(String code, Long tgUserId, boolean respectHolds) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Optional<PromoCode> opt = promoCodeRepository.findByCodeAndActiveTrueForUpdate(code.trim());
        if (opt.isEmpty()) {
            // Russian, and tagged: this text is shown to the customer, and the app clears the
            // dead code from the cart instead of leaving them stuck on the last step.
            throw new BadRequestException(messages.current("api.promo.rejected"), PROMO_REJECTED);
        }
        PromoCode promo = opt.get();
        // Personal codes (review bonus, V44): only the owner, and only until they expire.
        String personal = PromoService.personalRejection(promo, tgUserId, Instant.now());
        if (personal != null) {
            throw new BadRequestException(messages.current(personal), PROMO_REJECTED);
        }
        // Remaining uses minus other customers' live holds: a code someone reserved from their cart
        // must not be taken by a checkout that merely submitted first.
        long left = respectHolds
                ? promoService.remainingUses(promo, tgUserId)
                : (promo.getMaxUses() == null ? Long.MAX_VALUE : promo.getMaxUses() - promo.getUsesCount());
        if (left <= 0) {
            throw new BadRequestException(messages.current("api.promo.taken"), PROMO_REJECTED);
        }
        return promo;
    }

    /**
     * What of the subtotal a code does not touch: the low-margin products («Упор на скидки») — no promo
     * code applies to them, a case code or any other. A code on a cart of only such products is refused,
     * so the use is not wasted.
     */
    private long promoExcluded(PromoCode promo, long lowMarginMinor, long subtotal) {
        if (promo == null || lowMarginMinor <= 0) {
            return 0;
        }
        if (subtotal - lowMarginMinor <= 0) {
            throw new BadRequestException(messages.current("api.promo.caseExcluded"), PROMO_REJECTED);
        }
        return lowMarginMinor;
    }

    public static boolean isCasePromo(PromoCode promo) {
        return promo != null && GiftService.PROMO_SOURCE.equals(promo.getSource());
    }

    /** Price × quantity of the order's own lines (not gifts) whose product is low-margin. */
    private long lowMarginMinor(Order order) {
        java.util.Set<String> ids = lowMarginIds();
        return ids.isEmpty() ? 0 : order.getItems().stream()
                .filter(i -> !i.isGift() && ids.contains(UuidUtil.toString(i.getProductId())))
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity())
                .sum();
    }

    /** The order has a low-margin product of its own (not a gift): its case leans to discounts. */
    private boolean hasLowMargin(Order order) {
        java.util.Set<String> ids = lowMarginIds();
        return !ids.isEmpty() && order.getItems().stream()
                .anyMatch(i -> !i.isGift() && ids.contains(UuidUtil.toString(i.getProductId())));
    }

    private java.util.Set<String> lowMarginIds() {
        return caseLowMargin.none() ? java.util.Set.of() : caseLowMargin.productIds();
    }

    private DeliveryMethod parseDelivery(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(messages.current("api.order.deliveryRequired"));
        }
        try {
            return DeliveryMethod.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(messages.current("api.order.deliveryUnknown", value));
        }
    }

    private byte[] toBytes(String uuid, String field) {
        try {
            return UuidUtil.toBytes(uuid);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException(messages.current("api.order.fieldInvalid", fieldLabel(field)));
        }
    }

    /** The customer-facing name of a checkout field ("phone" → "телефон"); ids stay as they are. */
    private String fieldLabel(String field) {
        return switch (field) {
            case "customerName", "phone" -> messages.current("api.order.field." + field);
            default -> field;
        };
    }

    private String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(messages.current("api.order.fieldRequired", fieldLabel(field)));
        }
        return value.trim();
    }

    private static final class AccLine {
        final String productId;
        final String variantId;
        int quantity;

        AccLine(String productId, String variantId) {
            this.productId = productId;
            this.variantId = variantId;
        }
    }
}
