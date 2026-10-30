package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMessage;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
abstract class OrderScenarioTestBase {

    @Mock
    MoneyLedger moneyLedger;

    @Mock
    OrderRepository orderRepository;

    @Mock
    ProductRepository productRepository;

    @Mock
    PromoCodeRepository promoCodeRepository;

    @Mock
    PaymentOptionRepository paymentOptionRepository;


    @Mock
    ApplicationEventPublisher events;

    @Mock
    PromoService promoService;

    @Mock
    CartService cartService;

    @Mock
    com.maxsolch.shop.platform.i18n.Messages messages;

    @Mock
    EntityManager entityManager;

    @Mock
    com.maxsolch.shop.gift.app.GiftService gift;

    @Mock
    com.maxsolch.shop.gift.app.GiftRegistryService giftRegistry;

    @Mock
    com.maxsolch.shop.promo.app.CaseLowMargin caseLowMargin;

    @Mock
    com.maxsolch.shop.payment.infra.PaymentInvoiceRepository paymentInvoices;

    OrderApp app;

    Checkout service;

    OrderPayments payments;

    OrderArchive archive;

    String productUuid;

    byte[] productId;

    /** The active "pay in full online" option every checkout here picks. */
    PaymentOption fullPayment;

    @BeforeEach
    void setUp() {
        app = OrderApp.create(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), moneyLedger,
                paymentInvoices, gift, giftRegistry, caseLowMargin);
        service = app.checkout();
        payments = app.payments();
        archive = app.archive();
        // No gift configured, no monthly limit, no low-margin products — unless a test says otherwise.
        lenient().when(giftRegistry.remainingMinor(any(), any())).thenReturn(Long.MAX_VALUE);
        lenient().when(caseLowMargin.none()).thenReturn(true);
        // Reservations are a separate concern (PromoServiceTest); here every code is simply free.
        lenient().when(promoService.remainingUses(any(), any())).thenReturn(Long.MAX_VALUE);
        lenient().when(messages.current(any(String.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(messages.current(any(String.class), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
        productUuid = UUID.randomUUID().toString();
        productId = UuidUtil.toBytes(productUuid);
        fullPayment = paymentOption("Полная оплата онлайн", 0);
        lenient().when(paymentOptionRepository.findById(any())).thenAnswer(inv -> java.util.Arrays.equals(
                (byte[]) inv.getArgument(0), fullPayment.getId()) ? Optional.of(fullPayment) : Optional.empty());
        // orderRepository.save returns the same instance with an id assigned (PrePersist not run here).
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            if (o.getId() == null) {
                o.setId(UuidUtil.randomBytes());
            }
            return o;
        });
    }

    static PaymentOption paymentOption(String title, long prepaymentMinor) {
        PaymentOption po = new PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle(title);
        po.setRequiresPrepayment(prepaymentMinor > 0);
        po.setPrepaymentMinor(prepaymentMinor);
        po.setActive(true);
        return po;
    }

    Product simpleProduct(int stock, long priceMinor) {
        Product p = new Product();
        p.setId(productId);
        p.setTitle("Test Product");
        p.setPriceMinor(priceMinor);
        p.setStock(stock);
        p.setActive(true);
        p.setArchived(false);
        p.setVariants(new ArrayList<>());
        return p;
    }

    ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName("Size M");
        v.setStock(stock);
        return v;
    }

    CreateOrderCommand cmd(List<CreateOrderCommand.Line> lines, String promoCode) {
        return cmd(lines, promoCode, UuidUtil.toString(fullPayment.getId()));
    }

    CreateOrderCommand cmd(List<CreateOrderCommand.Line> lines, String promoCode, String paymentOptionId) {
        return new CreateOrderCommand(
                1L, 555L, "buyer",
                lines,
                "John Buyer", "+380000000000", "comment",
                promoCode,
                "PICKUP",
                null, null, null, null,
                paymentOptionId);
    }

    /** A mouse at 4 000 ₴ marked low-margin + this test's product (a pad) at 800 ₴; returns the mouse id. */
    String lowMarginCart() {
        Product pad = simpleProduct(10, 80_000);
        String mouseUuid = UUID.randomUUID().toString();
        Product mouse = simpleProduct(10, 400_000);
        mouse.setId(UuidUtil.toBytes(mouseUuid));
        when(productRepository.findByIdForUpdate(any())).thenAnswer(inv -> Optional.of(
                java.util.Arrays.equals((byte[]) inv.getArgument(0), productId) ? pad : mouse));
        lenient().when(caseLowMargin.none()).thenReturn(false);
        lenient().when(caseLowMargin.productIds()).thenReturn(java.util.Set.of(mouseUuid));
        return mouseUuid;
    }

    PromoCode casePromo(String code, int percent) {
        PromoCode promo = new PromoCode();
        promo.setCode(code);
        promo.setDiscountPercent(percent);
        promo.setActive(true);
        promo.setSource(com.maxsolch.shop.promo.domain.PromoCode.SOURCE_GIFT_CASE);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate(code)).thenReturn(Optional.of(promo));
        return promo;
    }

    Order persistedOrder(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        o.setItems(new ArrayList<>());
        return o;
    }

    Order approvedPrepaymentNotPaid() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(135_000);
        o.setPrepaymentMinor(10_000);
        o.setReceivedMinor(0);
        o.setPaymentDueAt(Instant.now().minusSeconds(3600));
        return o;
    }

    Order unpaidOrderWithOneItem(Product p, int qty, Instant dueAt) {
        Order o = persistedOrder(OrderStatus.NEW);
        o.setTotalMinor(p.getPriceMinor() * qty);
        o.setPaymentDueAt(dueAt);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(qty);
        it.setTitleSnapshot(p.getTitle());
        o.getItems().add(it);
        return o;
    }

    static OrderMessage message(String attachment) {
        OrderMessage m = new OrderMessage();
        m.setAttachmentUrl(attachment);
        return m;
    }

    record SizedPrize(Order order, OrderItem line, Product product, ProductVariant m, ProductVariant l,
                              ProductVariant xl) {
    }

    /** An opened case whose prize (a product with sizes) holds one M; L has one left, XL none. */
    SizedPrize sizedPrize(OrderStatus status) {
        Product p = simpleProduct(0, 50_000);
        ProductVariant m = variant(p, 3);
        m.setName("M");
        ProductVariant l = variant(p, 1);
        l.setName("L");
        l.setSortOrder(1);
        ProductVariant xl = variant(p, 0);
        xl.setName("XL");
        xl.setSortOrder(2);
        p.setVariants(new ArrayList<>(List.of(m, l, xl)));
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        o.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_OPENED);
        OrderItem line = new OrderItem();
        line.setOrder(o);
        line.setProductId(productId);
        line.setTitleSnapshot(p.getTitle());
        line.setQuantity(1);
        line.setGift(true);
        line.setAutoGift(true);
        line.setCaseRarity("RARE");
        line.setVariantId(m.getId());
        line.setVariantNameSnapshot("M");
        line.setVariantPending(true);
        o.getItems().add(line);
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        lenient().when(productRepository.findByIdForUpdate(productId)).thenReturn(Optional.of(p));
        lenient().when(productRepository.findById(productId)).thenReturn(Optional.of(p));
        return new SizedPrize(o, line, p, m, l, xl);
    }

    /** A checkout of 2 500 ₴ that reaches a silver case: a 3 000 ₴ product prize (almost sure) or a discount. */
    Order checkoutWithCase(long limitLeftMinor) {
        Product bought = simpleProduct(10, 2_500_00);
        String prizeUuid = UUID.randomUUID().toString();
        Product prize = new Product();
        prize.setId(UuidUtil.toBytes(prizeUuid));
        prize.setTitle("Prize");
        prize.setPriceMinor(3_000_00);
        prize.setStock(5);
        prize.setActive(true);
        prize.setVariants(new ArrayList<>());
        when(productRepository.findByIdForUpdate(any())).thenAnswer(inv -> Optional.of(
                java.util.Arrays.equals((byte[]) inv.getArgument(0), productId) ? bought : prize));

        var tier = com.maxsolch.shop.gift.domain.GiftCaseTier.Tier.SILVER;
        when(gift.giftConfig()).thenReturn(Optional.of(new com.maxsolch.shop.gift.app.GiftService.GiftConfig(null, 0,
                List.of(new com.maxsolch.shop.gift.app.GiftService.TierConfig(tier, 1_500_00, 0, 0, 0, List.of(
                        new com.maxsolch.shop.gift.app.GiftService.CaseEntry(1, tier,
                                com.maxsolch.shop.gift.domain.GiftCaseItem.Kind.PRODUCT, prizeUuid, 0, 0, "COMMON", 1_000_000),
                        new com.maxsolch.shop.gift.app.GiftService.CaseEntry(2, tier,
                                com.maxsolch.shop.gift.domain.GiftCaseItem.Kind.DISCOUNT, null, 5, 0, "RARE", 1)))))));
        when(giftRegistry.remainingMinor(any(), any())).thenReturn(limitLeftMinor);

        return service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null));
    }

    /** The order the last save() saw (the "database row" the lock query returns). */
    Order capturedOrder() {
        ArgumentCaptor<Order> c = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository, org.mockito.Mockito.atLeastOnce()).save(c.capture());
        return c.getValue();
    }

    Order orderWithOneLine(OrderStatus status, long price, int qty) {
        Order o = persistedOrder(status);
        OrderItem item = new OrderItem();
        item.setOrder(o);
        item.setProductId(productId);
        item.setPriceMinorSnapshot(price);
        item.setQuantity(qty);
        o.getItems().add(item);
        o.setSubtotalMinor(price * qty);
        o.setTotalMinor(price * qty);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }
}
