package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.PromoDiscount;
import com.maxsolch.shop.service.OrderStock;
import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.cart.domain.CartRules;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.gift.OrderGiftCase;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Placing an order: availability and variants, promo, stock reservation, delivery and payment snapshots, the
 * gift for the sum, the cart cleared. An admin may also type a sale in (already paid, no deadline).
 *
 * <p>Telegram notifications are not sent from here: the scenario publishes {@link OrderEvents} and
 * {@code OrderNotificationListener} delivers them after the transaction commits, so no database
 * connection or stock row lock is ever held across a network call to Telegram.
 */
@Service
public class Checkout {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final PaymentOptionRepository paymentOptionRepository;
    private final ApplicationEventPublisher events;
    private final OrderPromos promos;
    private final CartService cartService;
    private final Messages messages;
    private final OrderStock stock;
    /** Money received on an order: a manual order may be created already paid. */
    private final OrderPayments payments;
    /** The gift for the order sum / the gift case. */
    private final GiftService giftService;
    private final OrderOps ops;
    /** Drawing and placing the gift of the order sum. */
    private final OrderGiftPrizes giftPrizes;
    private final AppProperties props;

    Checkout(OrderRepository orderRepository,
                        ProductRepository productRepository,
                        PaymentOptionRepository paymentOptionRepository,
                        ApplicationEventPublisher events,
                        OrderPromos promos,
                        CartService cartService,
                        Messages messages,
                        OrderStock stock,
                        OrderPayments payments,
                        GiftService giftService,
                        OrderOps ops,
                        OrderGiftPrizes giftPrizes,
                        AppProperties props) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.paymentOptionRepository = paymentOptionRepository;
        this.events = events;
        this.promos = promos;
        this.cartService = cartService;
        this.messages = messages;
        this.stock = stock;
        this.payments = payments;
        this.giftService = giftService;
        this.ops = ops;
        this.giftPrizes = giftPrizes;
        this.props = props;
    }

    /**
     * Validate availability + variants, resolve/apply promo (fixed beats percent), decrement
     * stock (variant + product rollup), snapshot delivery & payment, persist with status NEW,
     * then notify (channel card + optional customer DM).
     */
    @Transactional
    public Order createOrder(CreateOrderCommand cmd) {
        if (cmd.items() == null || cmd.items().isEmpty()) {
            throw OrderErrors.badRequest(messages.current("api.order.noItems"));
        }

        DeliveryMethod deliveryMethod = parseDelivery(cmd.deliveryMethod());

        // Accumulate duplicate (productId, variantId) lines into a single requested quantity.
        Map<String, AccLine> acc = new LinkedHashMap<>();
        for (CreateOrderCommand.Line line : cmd.items()) {
            if (line.quantity() <= 0) {
                throw OrderErrors.badRequest(messages.current("api.order.quantityPositive"));
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
            throw OrderErrors.badRequest(messages.current("api.order.paymentRequired"));
        }
        PaymentOption po = paymentOptionRepository.findById(ops.toBytes(cmd.paymentOptionId(), "paymentOptionId"))
                .filter(PaymentOption::isActive)
                .orElseThrow(() -> OrderErrors.badRequest(messages.current("api.order.paymentUnknown")));
        order.setPaymentOptionId(po.getId());
        order.setPaymentOptionTitle(po.getTitle());
        order.setPrepaymentMinor(po.isRequiresPrepayment() ? po.getPrepaymentMinor() : 0);
        order.setPaymentDueAt(ops.now().plus(Duration.ofHours(Math.max(1, props.getPayment().getDueHours()))));

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
            locked.put(id, productRepository.findByIdForUpdate(ops.toBytes(id, "productId")));
        }
        for (AccLine line : lines) {
            Product product = locked.get(line.productId)
                    .orElseThrow(() -> OrderErrors.badRequest(messages.current("api.order.productUnknown")));
            if (!product.isActive() || product.isArchived()) {
                throw OrderErrors.badRequest(messages.current("api.order.unavailable", product.getTitle()));
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
                variant = ops.findVariant(product, line.variantId);
                if (variant == null) {
                    throw OrderErrors.badRequest(messages.current("api.order.variantMismatch", product.getTitle()));
                }
                item.setVariantId(variant.getId());
                item.setVariantNameSnapshot(variant.getName());
            } else if (hasVariants) {
                throw OrderErrors.badRequest(messages.current("api.order.variantRequired", product.getTitle()));
            }
            stock.requireAvailable(product, variant, line.quantity, cmd.userId());
            stock.reserve(product, variant, line.quantity, item);

            subtotal += product.getPriceMinor() * (long) line.quantity;
            order.getItems().add(item);
            toSave.add(product);
        }

        // Promo: fixed amount takes priority over percent.
        long discount = 0;
        PromoCode promo = promos.resolve(cmd.promoCode(), cmd.tgUserId(), true);
        long lowMarginMinor = promos.lowMarginMinor(order);
        if (promo != null) {
            discount = PromoDiscount.discountFor(promo, subtotal, promos.excluded(promo, lowMarginMinor, subtotal));
            order.setPromoCode(promo.getCode());
            promos.countUse(promo);
            if (cmd.tgUserId() != null) {
                promos.consumeHold(promo, cmd.tgUserId());
            }
        }

        order.setSubtotalMinor(subtotal);
        order.setDiscountMinor(discount);
        order.setTotalMinor(OrderMoney.totalMinor(subtotal, discount));

        // The gift for the order sum (docs/GIFT-CASE.md), against the total after the discount: the
        // tier's guaranteed discount (the customer's choice) or its case — the prize is drawn now.
        boolean lowMargin = lowMarginMinor > 0;
        OrderGiftCase drawn = giftCfg.map(g -> giftPrizes.applyThresholdGift(order, g, cmd.giftChoice(), locked, toSave, lowMargin))
                .orElse(null);

        order.settleIfFree(ops.now());

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
                .orElseThrow(() -> OrderErrors.badRequest("нет активного способа оплаты для нового заказа"));
    }

    private DeliveryMethod parseDelivery(String value) {
        if (value == null || value.isBlank()) {
            throw OrderErrors.badRequest(messages.current("api.order.deliveryRequired"));
        }
        try {
            return DeliveryMethod.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw OrderErrors.badRequest(messages.current("api.order.deliveryUnknown", value));
        }
    }

    private String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw OrderErrors.badRequest(messages.current("api.order.fieldRequired", ops.fieldLabel(field)));
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
