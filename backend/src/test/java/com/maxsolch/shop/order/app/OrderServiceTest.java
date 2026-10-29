package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.PromoDiscount;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.service.StockFixtures;
import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.cart.domain.CartRules;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.order.domain.OrderMoney;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMessage;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.platform.error.BadRequestException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

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
    NotificationService notificationService;
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
    com.maxsolch.shop.gift.GiftService gift;
    @Mock
    com.maxsolch.shop.gift.GiftRegistryService giftRegistry;
    @Mock
    com.maxsolch.shop.gift.CaseLowMargin caseLowMargin;
    @Mock
    com.maxsolch.shop.payment.PaymentInvoiceRepository paymentInvoices;

    OrderService service;

    private String productUuid;
    private byte[] productId;
    /** The active "pay in full online" option every checkout here picks. */
    private PaymentOption fullPayment;

    @BeforeEach
    void setUp() {
        service = OrderServiceFixtures.create(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), moneyLedger,
                paymentInvoices, gift, giftRegistry, caseLowMargin);
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

    private static PaymentOption paymentOption(String title, long prepaymentMinor) {
        PaymentOption po = new PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle(title);
        po.setRequiresPrepayment(prepaymentMinor > 0);
        po.setPrepaymentMinor(prepaymentMinor);
        po.setActive(true);
        return po;
    }

    private Product simpleProduct(int stock, long priceMinor) {
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

    private ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName("Size M");
        v.setStock(stock);
        return v;
    }

    private CreateOrderCommand cmd(List<CreateOrderCommand.Line> lines, String promoCode) {
        return cmd(lines, promoCode, UuidUtil.toString(fullPayment.getId()));
    }

    private CreateOrderCommand cmd(List<CreateOrderCommand.Line> lines, String promoCode, String paymentOptionId) {
        return new CreateOrderCommand(
                1L, 555L, "buyer",
                lines,
                "John Buyer", "+380000000000", "comment",
                promoCode,
                "PICKUP",
                null, null, null, null,
                paymentOptionId);
    }

    // ---------- createOrder happy path ----------

    @Test
    void createOrder_happyPath_setsTotalsStockSnapshotsAndStatusNew() {
        Product p = simpleProduct(10, 2_500); // 25.00
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 2)), null);

        Order order = service.createOrder(command);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(order.getCurrency()).isEqualTo("UAH");
        assertThat(order.getSubtotalMinor()).isEqualTo(5_000); // 2 * 2500
        assertThat(order.getDiscountMinor()).isZero();
        assertThat(order.getTotalMinor()).isEqualTo(5_000);
        assertThat(order.getCustomerName()).isEqualTo("John Buyer");

        // item snapshot
        assertThat(order.getItems()).hasSize(1);
        OrderItem it = order.getItems().get(0);
        assertThat(it.getTitleSnapshot()).isEqualTo("Test Product");
        assertThat(it.getPriceMinorSnapshot()).isEqualTo(2_500);
        assertThat(it.getQuantity()).isEqualTo(2);

        // stock decremented by qty
        assertThat(p.getStock()).isEqualTo(8);

        verify(productRepository).saveAll(any());
        verify(orderRepository).save(any(Order.class));
        // Telegram is notified from an after-commit listener now, so the service only publishes.
        verify(events).publishEvent(any(OrderEvents.Created.class));

        // payment snapshot + the clock to pay online
        assertThat(order.getPaymentOptionTitle()).isEqualTo("Полная оплата онлайн");
        assertThat(order.getPrepaymentMinor()).isZero();
        assertThat(order.getPaymentDueAt()).isBetween(Instant.now().plus(java.time.Duration.ofHours(23)),
                Instant.now().plus(java.time.Duration.ofHours(25)));
        assertThat(OrderMoney.amountDueMinor(order)).isEqualTo(5_000);
    }

    @Test
    void createOrder_withoutPaymentOption_throws() {
        CreateOrderCommand command = cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null, null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.paymentRequired");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void createOrder_inactivePaymentOption_throws() {
        fullPayment.setActive(false);
        CreateOrderCommand command = cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.paymentUnknown");
    }

    @Test
    void createOrder_prepaymentOption_onlyThePrepaymentIsDueOnline() {
        PaymentOption prepay = paymentOption("Предоплата 100 грн + наложка", 10_000);
        when(paymentOptionRepository.findById(any())).thenReturn(Optional.of(prepay));
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(simpleProduct(5, 50_000)));

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null,
                UuidUtil.toString(prepay.getId())));

        assertThat(order.getPrepaymentMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.dueOnlineMinor(order)).isEqualTo(10_000);
        assertThat(OrderMoney.amountDueMinor(order)).isEqualTo(10_000);
    }

    @Test
    void createOrder_withVariant_decrementsVariantAndRollsUpProductStock() {
        // When a product has variants, the variant counters are the source of truth and
        // product.stock is their sum (same rule AdminProductService applies when saving a
        // product). Decrementing both independently is what used to let stock drift.
        Product p = simpleProduct(4, 1_000);
        ProductVariant v = variant(p, 4);
        p.getVariants().add(v);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        String variantUuid = UuidUtil.toString(v.getId());
        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, variantUuid, 3)), null);

        Order order = service.createOrder(command);

        assertThat(v.getStock()).isEqualTo(1);   // 4 - 3
        assertThat(p.getStock()).isEqualTo(1);   // rollup = sum(variants)
        OrderItem it = order.getItems().get(0);
        assertThat(it.getVariantNameSnapshot()).isEqualTo("Size M");
        assertThat(it.getVariantId()).isEqualTo(v.getId());
    }

    // ---------- server cart ----------

    @Test
    void createOrder_removesOrderedLinesFromServerCart() {
        Product p = simpleProduct(4, 1_000);
        ProductVariant v = variant(p, 4);
        p.getVariants().add(v);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));
        String variantUuid = UuidUtil.toString(v.getId());

        service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, variantUuid, 1)), null));

        verify(cartService).removeOrdered(1L, List.of(new CartRules.LineKey(productUuid, variantUuid)));
    }

    @Test
    void createOrder_failure_leavesServerCartAlone() {
        Product p = simpleProduct(1, 1_000);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> service.createOrder(
                cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 5)), null)))
                .isInstanceOf(BadRequestException.class);
        verify(cartService, never()).removeOrdered(org.mockito.ArgumentMatchers.anyLong(), any());
    }

    // ---------- stock / variant validation ----------

    @Test
    void createOrder_outOfStock_throws() {
        Product p = simpleProduct(1, 1_000);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 5)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.outOfStock");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void createOrder_variantRequiredButMissing_throws() {
        Product p = simpleProduct(10, 1_000);
        p.getVariants().add(variant(p, 5)); // product has variants
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null); // no variant

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.variantRequired");
    }

    @Test
    void createOrder_variantNotBelongingToProduct_throws() {
        Product p = simpleProduct(10, 1_000);
        p.getVariants().add(variant(p, 5));
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        String foreignVariant = UUID.randomUUID().toString();
        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, foreignVariant, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.variantMismatch");
    }

    @Test
    void createOrder_variantOutOfStock_throws() {
        Product p = simpleProduct(10, 1_000);
        ProductVariant v = variant(p, 1);
        p.getVariants().add(v);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, UuidUtil.toString(v.getId()), 5)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.outOfStock");
    }

    @Test
    void createOrder_emptyItems_throws() {
        CreateOrderCommand command = cmd(List.of(), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.noItems");
    }

    @Test
    void createOrder_inactiveProduct_throws() {
        Product p = simpleProduct(10, 1_000);
        p.setActive(false);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.order.unavailable");
    }

    // ---------- promo ----------

    @Test
    void createOrder_percentPromo_appliesPercentDiscount() {
        Product p = simpleProduct(10, 10_000); // 100.00
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("SAVE10");
        promo.setDiscountPercent(10);
        promo.setDiscountAmountMinor(0);
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("SAVE10")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "SAVE10");

        Order order = service.createOrder(command);

        assertThat(order.getSubtotalMinor()).isEqualTo(10_000);
        assertThat(order.getDiscountMinor()).isEqualTo(1_000); // 10% of 10000
        assertThat(order.getTotalMinor()).isEqualTo(9_000);
        assertThat(order.getPromoCode()).isEqualTo("SAVE10");
        assertThat(promo.getUsesCount()).isEqualTo(1);
        verify(promoCodeRepository).save(promo);
    }

    @Test
    void createOrder_promoCeiling_capsThePercent() {
        Product p = simpleProduct(10, 1_000_000); // 10 000 ₴
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("SAVE5");
        promo.setDiscountPercent(5);
        promo.setMaxDiscountMinor(10_000); // at most 100 ₴
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("SAVE5")).thenReturn(Optional.of(promo));

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "SAVE5"));

        assertThat(order.getDiscountMinor()).isEqualTo(10_000); // −100 ₴, not −500 ₴
        assertThat(order.getTotalMinor()).isEqualTo(990_000);
    }

    @Test
    void createOrder_promoCoversEverything_isPaidAtOnce_withoutDeadline() {
        Product p = simpleProduct(10, 15_000); // glides at 150 ₴, a case prize code for 150 ₴
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));
        PromoCode promo = new PromoCode();
        promo.setCode("CASE150");
        promo.setDiscountAmountMinor(15_000);
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("CASE150")).thenReturn(Optional.of(promo));

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "CASE150"));

        assertThat(order.getTotalMinor()).isZero();
        assertThat(order.isPaid()).isTrue();
        assertThat(order.getPaidAt()).isNotNull();
        assertThat(order.getPaymentDueAt()).isNull();
        assertThat(OrderMoney.onlinePaymentMissing(order)).isFalse();
    }

    // ---------- a case promo code and low-margin products (docs/GIFT-CASE.md) ----------

    /** A mouse at 4 000 ₴ marked low-margin + this test's product (a pad) at 800 ₴; returns the mouse id. */
    private String lowMarginCart() {
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

    private PromoCode casePromo(String code, int percent) {
        PromoCode promo = new PromoCode();
        promo.setCode(code);
        promo.setDiscountPercent(percent);
        promo.setActive(true);
        promo.setSource(com.maxsolch.shop.gift.GiftService.PROMO_SOURCE);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate(code)).thenReturn(Optional.of(promo));
        return promo;
    }

    @Test
    void createOrder_casePromo_skipsLowMarginProducts() {
        String mouse = lowMarginCart();
        casePromo("CASE10", 10);

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1),
                new CreateOrderCommand.Line(productUuid, null, 1)), "CASE10"));

        assertThat(order.getSubtotalMinor()).isEqualTo(480_000);
        assertThat(order.getDiscountMinor()).isEqualTo(8_000); // 10 % of the pad only
    }

    @Test
    void createOrder_ordinaryPromo_alsoSkipsLowMarginProducts() {
        String mouse = lowMarginCart();
        PromoCode promo = new PromoCode();
        promo.setCode("SAVE10");
        promo.setDiscountPercent(10);
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("SAVE10")).thenReturn(Optional.of(promo));

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1),
                new CreateOrderCommand.Line(productUuid, null, 1)), "SAVE10"));

        assertThat(order.getDiscountMinor()).isEqualTo(8_000); // 10 % of the pad only
    }

    @Test
    void createOrder_promoCeiling_appliesAfterLowMarginProducts() {
        String mouse = lowMarginCart(); // mouse 4 000 ₴ low-margin, pad 800 ₴
        PromoCode promo = new PromoCode();
        promo.setCode("SAVE30");
        promo.setDiscountPercent(30);
        promo.setMaxDiscountMinor(10_000); // at most 100 ₴
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("SAVE30")).thenReturn(Optional.of(promo));

        Order order = service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1),
                new CreateOrderCommand.Line(productUuid, null, 1)), "SAVE30"));

        // 30 % of the pad (240 ₴) → ceiling 100 ₴; the mouse is not touched.
        assertThat(order.getDiscountMinor()).isEqualTo(10_000);
    }

    @Test
    void createOrder_ordinaryPromo_onlyLowMarginProducts_isRefused() {
        String mouse = lowMarginCart();
        PromoCode promo = new PromoCode();
        promo.setCode("SAVE10");
        promo.setDiscountPercent(10);
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("SAVE10")).thenReturn(Optional.of(promo));

        assertThatThrownBy(() -> service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1)), "SAVE10")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.promo.caseExcluded");
        assertThat(promo.getUsesCount()).isZero();
    }

    @Test
    void createOrder_casePromo_onlyLowMarginProducts_isRefusedAndNotUsed() {
        String mouse = lowMarginCart();
        PromoCode promo = casePromo("CASE10", 10);

        assertThatThrownBy(() -> service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1)), "CASE10")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("api.promo.caseExcluded");
        assertThat(promo.getUsesCount()).isZero();
    }

    @Test
    void createOrder_fixedAmount_takesPriorityOverPercent() {
        Product p = simpleProduct(10, 10_000);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("MIX");
        promo.setDiscountPercent(50);          // would be 5000
        promo.setDiscountAmountMinor(2_000);   // fixed wins
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("MIX")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "MIX");

        Order order = service.createOrder(command);

        assertThat(order.getDiscountMinor()).isEqualTo(2_000); // fixed amount, not 5000
        assertThat(order.getTotalMinor()).isEqualTo(8_000);
    }

    @Test
    void createOrder_fixedAmountExceedsSubtotal_totalNeverNegative() {
        Product p = simpleProduct(10, 3_000);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("BIG");
        promo.setDiscountAmountMinor(999_999); // way more than subtotal
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("BIG")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "BIG");

        Order order = service.createOrder(command);

        assertThat(order.getSubtotalMinor()).isEqualTo(3_000);
        assertThat(order.getDiscountMinor()).isEqualTo(3_000); // capped at subtotal
        assertThat(order.getTotalMinor()).isZero(); // never negative
    }

    @Test
    void createOrder_invalidPromo_throws() {
        Product p = simpleProduct(10, 1_000);
        lenient().when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("NOPE")).thenReturn(Optional.empty());

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "NOPE");

        // The apps branch on the CODE, not the wording: the message is customer-facing Russian and
        // is free to change.
        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(BadRequestException.class))
                .extracting(BadRequestException::getCode)
                .isEqualTo(OrderService.PROMO_REJECTED);
    }

    // ---------- status transitions ----------

    private Order persistedOrder(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
        o.setItems(new ArrayList<>());
        return o;
    }

    @Test
    void approve_thenShip_thenDeliver_setTimestamps() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order approved = service.approve(o.getId());
        assertThat(approved.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(approved.getApprovedAt()).isNotNull();

        Order shipped = service.ship(o.getId(), "TTN123");
        assertThat(shipped.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(shipped.getShippedAt()).isNotNull();
        assertThat(shipped.getTrackingNumber()).isEqualTo("TTN123");

        Order delivered = service.deliver(o.getId());
        assertThat(delivered.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(delivered.getDeliveredAt()).isNotNull();

        verify(events, times(3)).publishEvent(any(OrderEvents.StatusChanged.class));
    }

    @Test
    void approve_nonNewOrder_throws() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.approve(o.getId()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("только новый");
    }

    @Test
    void deliver_nonShippedOrder_throws() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.deliver(o.getId()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("только отправленный");
    }

    @Test
    void reject_restoresStockForProductAndVariant() {
        // order with one item referencing product+variant
        Order o = persistedOrder(OrderStatus.NEW);

        Product p = simpleProduct(1, 1_000);
        ProductVariant v = variant(p, 1);
        p.getVariants().add(v);

        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setVariantId(v.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        o.getItems().add(it);

        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        Order rejected = service.reject(o.getId(), "out of stock", true);

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getRejectedAt()).isNotNull();
        assertThat(rejected.getRejectReason()).isEqualTo("out of stock");
        assertThat(v.getStock()).isEqualTo(4); // 1 + 3 restored
        assertThat(p.getStock()).isEqualTo(4); // rollup = sum(variants)
        verify(productRepository).save(p);
    }

    @Test
    void reject_alreadyRejected_throws() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.reject(o.getId(), "x", true))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("уже отклонён");
    }

    @Test
    void reject_deliveredOrder_isRefused_useReturnInstead() {
        // Rejecting a delivered order kept its automatic «получено» — money that never was.
        Order o = persistedOrder(OrderStatus.DELIVERED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.reject(o.getId(), "возврат на НП", false))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("оформите «Возврат»");
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
    }

    @Test
    void reject_withReasonCode_storesCodeAndBlankTextAsNull() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order rejected = service.reject(o.getId(), "  ", com.maxsolch.shop.order.domain.RejectReasonCode.NO_RESPONSE, false);

        assertThat(rejected.getRejectReasonCode()).isEqualTo("NO_RESPONSE");
        // Blank text must not reach the customer as an empty "Причина:".
        assertThat(rejected.getRejectReason()).isNull();
    }

    @Test
    void reject_afterPartialReturn_doesNotRestockReturnedUnitsTwice() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        Product p = simpleProduct(0, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        // One unit already came back and was put on the shelf by a partial return.
        it.setReturnedQty(1);
        it.setRestockedQty(1);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        service.reject(o.getId(), "возврат", true);

        assertThat(p.getStock()).isEqualTo(2); // only the 2 units still out
        assertThat(it.getRestockedQty()).isEqualTo(3);
    }

    @Test
    void reject_afterReturnWithoutRestock_doesNotPutWrittenOffUnitsBack() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        Product p = simpleProduct(0, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        // One unit came back damaged: returned, but «на склад» was off — it is written off.
        it.setReturnedQty(1);
        it.setRestockedQty(0);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        service.reject(o.getId(), "возврат", true);

        assertThat(p.getStock()).isEqualTo(2); // only the 2 units never returned
    }

    @Test
    void ship_withPendingCancelRequest_throws() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setCancelRequestStatus(com.maxsolch.shop.order.domain.CancelRequestStatus.PENDING.name());
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.ship(o.getId(), null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("запрос отмены");
        assertThat(o.getStatus()).isEqualTo(OrderStatus.APPROVED);
    }

    private Order approvedPrepaymentNotPaid() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(135_000);
        o.setPrepaymentMinor(10_000);
        o.setReceivedMinor(0);
        o.setPaymentDueAt(Instant.now().minusSeconds(3600));
        return o;
    }

    @Test
    void ship_withoutTheOnlinePayment_needsTheAdminsConfirmation() {
        Order o = approvedPrepaymentNotPaid();
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.ship(o.getId(), "20450000000000"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Предоплата по заказу #")
                .hasMessageContaining("не пришла")
                .satisfies(e -> assertThat(((BadRequestException) e).getCode()).isEqualTo(OrderService.SHIP_UNPAID_CODE));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.APPROVED);

        Order shipped = service.changeStatus(o.getId(), OrderStatus.SHIPPED, "20450000000000", null, null, true, true);
        assertThat(shipped.getStatus()).isEqualTo(OrderStatus.SHIPPED);
    }

    @Test
    void onlinePaymentMissing_onlyForOnlineOrdersWithMoneyStillDue() {
        Order o = approvedPrepaymentNotPaid();
        assertThat(OrderMoney.onlinePaymentMissing(o)).isTrue();
        o.setReceivedMinor(10_000); // the prepayment arrived; the rest is наложка
        assertThat(OrderMoney.onlinePaymentMissing(o)).isFalse();
        Order legacy = persistedOrder(OrderStatus.APPROVED);
        legacy.setTotalMinor(50_000); // before online payments: no deadline, nothing "missing"
        assertThat(OrderMoney.onlinePaymentMissing(legacy)).isFalse();
    }

    @Test
    void cancelByCustomer_setsChangedMindCode() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order cancelled = service.cancelByCustomer(o.getId(), "передумал");

        assertThat(cancelled.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
    }

    // ---------- changeStatus dispatcher ----------

    @Test
    void changeStatus_toNew_throwsInvalidTransition() {
        Order o = persistedOrder(OrderStatus.NEW);
        // findById not needed: NEW case throws before any lookup
        assertThatThrownBy(() -> service.changeStatus(o.getId(), OrderStatus.NEW, null, null, true))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("«Новые» нельзя");
    }

    @Test
    void changeStatus_dispatchesToApprove() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order result = service.changeStatus(o.getId(), OrderStatus.APPROVED, null, null, true);

        assertThat(result.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(result.getApprovedAt()).isNotNull();
    }

    // ---------- online payment ----------

    @Test
    void recordOnlinePayment_creditsTheMoneyMarksPaidAndKeepsTheStatus() {
        Order o = persistedOrder(OrderStatus.NEW);
        o.setTotalMinor(50_000);
        o.setPrepaymentMinor(10_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = service.recordOnlinePayment(o.getId(), 10_000);

        assertThat(paid.getStatus()).isEqualTo(OrderStatus.NEW); // an admin still confirms
        assertThat(paid.isPaid()).isTrue();
        assertThat(paid.getPaidAt()).isNotNull();
        assertThat(paid.getReceivedMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.codMinor(paid)).isEqualTo(40_000);
        assertThat(OrderMoney.amountDueMinor(paid)).isZero();
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue()).isInstanceOf(OrderEvents.PaymentReceived.class);
        assertThat(((OrderEvents.PaymentReceived) event.getValue()).amountMinor()).isEqualTo(10_000);
    }

    @Test
    void recordOnlinePayment_receivedIsCappedAtTheTotal() {
        // e.g. the total was lowered (a discount) after the customer had paid in full
        Order o = persistedOrder(OrderStatus.NEW);
        o.setTotalMinor(30_000);
        o.setReceivedMinor(20_000);
        o.setPaid(true);
        Instant paidAt = Instant.now().minus(java.time.Duration.ofHours(1));
        o.setPaidAt(paidAt);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = service.recordOnlinePayment(o.getId(), 20_000);

        assertThat(paid.getReceivedMinor()).isEqualTo(30_000);
        assertThat(paid.getPaidAt()).isEqualTo(paidAt); // the first payment time is kept
        assertThat(OrderMoney.codMinor(paid)).isZero();
    }

    @Test
    void recordOnlineRefund_addsToRefunded() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        o.setRefundedMinor(1_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThat(service.recordOnlineRefund(o.getId(), 4_000).getRefundedMinor()).isEqualTo(5_000);
    }

    private Order unpaidOrderWithOneItem(Product p, int qty, Instant dueAt) {
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

    @Test
    void expireUnpaid_rejectsWithPaymentTimeoutAndRestocks() {
        Instant now = Instant.now();
        Product p = simpleProduct(1, 1_000);
        Order o = unpaidOrderWithOneItem(p, 2, now.minusSeconds(1));
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        Order expired = service.expireUnpaid(o.getId(), now);

        assertThat(expired).isNotNull();
        assertThat(expired.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(expired.getRejectReasonCode()).isEqualTo(RejectReasonCode.PAYMENT_TIMEOUT.name());
        assertThat(expired.getRejectedAt()).isEqualTo(now);
        assertThat(expired.getRejectReason()).contains("24");
        assertThat(p.getStock()).isEqualTo(3); // 1 + 2 back on the shelf
        verify(events).publishEvent(any(OrderEvents.StatusChanged.class));
    }

    @Test
    void expireUnpaid_skipsPaidNotYetDueLegacyAndMovedOnOrders() {
        Instant now = Instant.now();
        Product p = simpleProduct(1, 1_000);

        Order paid = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        paid.setPaid(true);
        paid.setReceivedMinor(1_000);
        Order partlyPaid = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        partlyPaid.setReceivedMinor(100);
        Order notDue = unpaidOrderWithOneItem(p, 1, now.plusSeconds(60));
        Order legacy = unpaidOrderWithOneItem(p, 1, null); // placed before online payment existed
        Order approved = unpaidOrderWithOneItem(p, 1, now.minusSeconds(60));
        approved.setStatus(OrderStatus.APPROVED);
        for (Order o : List.of(paid, partlyPaid, notDue, legacy, approved)) {
            when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
            assertThat(service.expireUnpaid(o.getId(), now)).isNull();
        }

        assertThat(p.getStock()).isEqualTo(1);
        assertThat(notDue.getStatus()).isEqualTo(OrderStatus.NEW);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(orderRepository, never()).save(any());
        verify(events, never()).publishEvent(any());
    }

    @Test
    void markPaid_recordsTheAmountAndShrinksCod() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = service.markPaid(o.getId(), 10_000);

        assertThat(paid.isPaid()).isTrue();
        assertThat(paid.getReceivedMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.codMinor(paid)).isEqualTo(40_000);
    }

    @Test
    void markPaid_moreThanTheTotal_isRejectedInsteadOfSilentlyCapped() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        o.setCurrency("UAH");
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.markPaid(o.getId(), 999_999))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("больше суммы заказа");
        assertThat(o.getReceivedMinor()).isZero();
        verify(orderRepository, never()).save(any());
    }

    @Test
    void markPaid_fullTotalIsAccepted() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = service.markPaid(o.getId(), 50_000);

        assertThat(paid.getReceivedMinor()).isEqualTo(50_000);
        assertThat(OrderMoney.codMinor(paid)).isZero();
    }

    // ---------- row locking ----------

    @Test
    void mutations_lockTheOrderRowAndReReadIt() {
        // open-in-view: the controller has usually loaded this order already, and a locking query
        // would hand back that stale instance — the refresh under the lock is what makes the
        // status checks see a concurrent change.
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        service.reject(o.getId(), "x", false);

        verify(orderRepository).findByIdForUpdate(o.getId());
        verify(orderRepository, never()).findById(any());
        verify(entityManager).refresh(o, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void reject_afterACustomerCancelCommitted_doesNotRestockTwice() {
        // Simulates the race: by the time the admin's reject gets the row lock, the customer's
        // cancel has committed. The refresh under the lock surfaces REJECTED, so the stock is not
        // returned a second time.
        Order o = persistedOrder(OrderStatus.NEW);
        Product p = simpleProduct(5, 1_000);
        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setQuantity(2);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        org.mockito.Mockito.doAnswer(inv -> {
            ((Order) inv.getArgument(0)).setStatus(OrderStatus.REJECTED);
            return null;
        }).when(entityManager).refresh(o, LockModeType.PESSIMISTIC_WRITE);

        assertThatThrownBy(() -> service.reject(o.getId(), "x", true))
                .isInstanceOf(BadRequestException.class);
        assertThat(p.getStock()).isEqualTo(5);
        verify(productRepository, never()).findByIdForUpdate(any());
    }

    @Test
    void restoreStock_locksProductsInIdOrder() {
        Order o = persistedOrder(OrderStatus.NEW);
        byte[] high = UuidUtil.toBytes("ffffffff-0000-0000-0000-000000000000");
        byte[] low = UuidUtil.toBytes("00000000-0000-0000-0000-000000000001");
        for (byte[] pid : List.of(high, low)) {
            OrderItem it = new OrderItem();
            it.setProductId(pid);
            it.setQuantity(1);
            o.getItems().add(it);
        }
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.empty());

        service.reject(o.getId(), "x", true);

        InOrder order = inOrder(productRepository);
        order.verify(productRepository).findByIdForUpdate(low);
        order.verify(productRepository).findByIdForUpdate(high);
    }

    // ---------- dispatch sync ----------

    @Test
    void broadcastDispatch_writesOnlyChangedCardIds_withoutDirtyFlushingTheOrder() {
        Order posted = persistedOrder(OrderStatus.APPROVED);
        Order unchanged = persistedOrder(OrderStatus.APPROVED);
        unchanged.setDispatchMessageId(5);
        when(orderRepository.findWithItemsByStatus(OrderStatus.APPROVED)).thenReturn(List.of(posted, unchanged));
        when(notificationService.syncDispatchCard(posted)).thenAnswer(inv -> {
            posted.setDispatchMessageId(99);
            return true;
        });
        when(notificationService.syncDispatchCard(unchanged)).thenReturn(false);

        assertThat(service.broadcastDispatch()).isEqualTo(1);

        verify(entityManager).detach(posted);
        verify(entityManager).detach(unchanged);
        verify(orderRepository).updateDispatchMessageId(posted.getId(), 99);
        verify(orderRepository, never()).updateDispatchMessageId(unchanged.getId(), 5);
        verify(orderRepository, never()).save(any());
    }

    // ---------- archive (orders are never deleted) ----------

    @Test
    void archive_inProgressOrder_isRejected() {
        for (OrderStatus status : List.of(OrderStatus.NEW, OrderStatus.APPROVED, OrderStatus.SHIPPED)) {
            Order o = persistedOrder(status);
            when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

            assertThatThrownBy(() -> service.archive(o.getId(), "дубль заказа", "Влад"))
                    .isInstanceOf(BadRequestException.class)
                    .hasMessageContaining("только доставленный или отклонённый");
        }
        verify(orderRepository, never()).delete(any());
    }

    @Test
    void archive_keepsEverything_noStockNoPromoNoDelete() {
        Order o = persistedOrder(OrderStatus.DELIVERED);
        o.setPromoCode("SALE");
        OrderItem it = new OrderItem();
        it.setProductId(productId);
        it.setQuantity(2);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order archived = service.archive(o.getId(), "тестовый заказ", "Влад");

        assertThat(archived.getArchivedAt()).isNotNull();
        assertThat(archived.getArchivedBy()).isEqualTo("Влад");
        assertThat(archived.getArchiveReason()).isEqualTo("тестовый заказ");
        assertThat(archived.getItems()).hasSize(1);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(promoCodeRepository, never()).findByCodeForUpdate(any());
        verify(orderRepository, never()).delete(any());
    }

    @Test
    void archive_needsReason_andUnarchiveRestores() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.archive(o.getId(), " ", "Влад"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("почему");

        service.archive(o.getId(), "дубль", "Влад");
        assertThatThrownBy(() -> service.archive(o.getId(), "дубль", "Влад"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("уже в архиве");

        Order back = service.unarchive(o.getId());
        assertThat(back.getArchivedAt()).isNull();
        assertThat(back.getArchiveReason()).isNull();
    }

    @Test
    void archive_paymentStillProcessing_isRejected() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        com.maxsolch.shop.payment.PaymentInvoice processing = new com.maxsolch.shop.payment.PaymentInvoice();
        processing.setStatus(com.maxsolch.shop.payment.PaymentInvoice.PROCESSING);
        processing.setAmountMinor(150_000);
        when(paymentInvoices.findByOrderIdOrderByCreatedAtDesc(o.getId())).thenReturn(List.of(processing));

        assertThatThrownBy(() -> service.archive(o.getId(), "дубль", "Влад"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("банк ещё обрабатывает");
    }

    @Test
    void rejectShipped_withReturnInTransit_doesNotRestock_andRetainsPrepayment() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        o.setPrepaymentMinor(10_000);
        o.setReceivedMinor(10_000);
        OrderItem it = new OrderItem();
        it.setProductId(productId);
        it.setQuantity(1);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order rejected = service.reject(o.getId(), null, RejectReasonCode.REFUSED_AT_POST, true, true);

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(rejected.getReturnSentAt()).isNotNull();
        assertThat(it.getReturnPendingQty()).isEqualTo(1);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(moneyLedger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.RETAINED),
                any(), eq(10_000L), any(), any(), any(), any());
    }

    private static OrderMessage message(String attachment) {
        OrderMessage m = new OrderMessage();
        m.setAttachmentUrl(attachment);
        return m;
    }

    @Test
    void markPaid_withZeroClearsThePayment() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        o.setPaid(true);
        o.setReceivedMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order cleared = service.markPaid(o.getId(), 0);

        assertThat(cleared.isPaid()).isFalse();
        assertThat(cleared.getPaidAt()).isNull();
        assertThat(cleared.getReceivedMinor()).isZero();
    }

    @Test
    void markPaid_correctingAPaidOrder_keepsTheOriginalPaymentDate() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        Instant paidAt = Instant.parse("2026-10-01T10:00:00Z");
        o.setPaid(true);
        o.setPaidAt(paidAt);
        o.setReceivedMinor(10_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order fixed = service.markPaid(o.getId(), 50_000);

        assertThat(fixed.getReceivedMinor()).isEqualTo(50_000);
        assertThat(fixed.getPaidAt()).isEqualTo(paidAt);
    }

    @Test
    void markPaid_firstPayment_isDatedNow() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        Instant before = Instant.now();

        Order paid = service.markPaid(o.getId(), 10_000);

        assertThat(paid.getPaidAt()).isNotNull().isAfterOrEqualTo(before);
    }

    // ---------- promo discount rules ----------

    @Test
    void discountFor_capsPercentAtOneHundred() {
        PromoCode broken = new PromoCode();
        broken.setDiscountPercent(150); // misconfigured code

        // Capped at the subtotal, so a total can never go negative and the stored discount can
        // never exceed the order itself.
        assertThat(PromoDiscount.discountFor(broken, 10_000)).isEqualTo(10_000);
    }

    @Test
    void discountFor_fixedAmountBeatsPercentAndIsCapped() {
        PromoCode promo = new PromoCode();
        promo.setDiscountAmountMinor(30_000);
        promo.setDiscountPercent(10);

        assertThat(PromoDiscount.discountFor(promo, 10_000)).isEqualTo(10_000);
        assertThat(PromoDiscount.discountFor(promo, 100_000)).isEqualTo(30_000);
    }

    @Test
    void discountFor_ceilingCapsThePercent() {
        PromoCode bonus = new PromoCode();
        bonus.setDiscountPercent(5);
        bonus.setMaxDiscountMinor(10_000); // 5 %, but at most 100 ₴

        assertThat(PromoDiscount.discountFor(bonus, 1_000_000)).isEqualTo(10_000); // 10 000 ₴ → −100 ₴
        assertThat(PromoDiscount.discountFor(bonus, 200_000)).isEqualTo(10_000);   // exactly 5 %
        assertThat(PromoDiscount.discountFor(bonus, 100_000)).isEqualTo(5_000);    // below the ceiling
        assertThat(PromoDiscount.discountFor(bonus, 4_000)).isEqualTo(200);

        bonus.setMaxDiscountMinor(0); // no ceiling
        assertThat(PromoDiscount.discountFor(bonus, 1_000_000)).isEqualTo(50_000);
    }

    @Test
    void discountFor_ceilingAppliesAfterTheExcludedPartAndThePercent() {
        PromoCode promo = new PromoCode();
        promo.setDiscountPercent(10);
        promo.setMaxDiscountMinor(15_000);

        // 10 000 ₴, of them 8 000 ₴ excluded: 10 % of 2 000 ₴ = 200 ₴ → ceiling 150 ₴.
        assertThat(PromoDiscount.discountFor(promo, 1_000_000, 800_000)).isEqualTo(15_000);
        // 9 000 ₴ excluded: 10 % of 1 000 ₴ = 100 ₴, under the ceiling.
        assertThat(PromoDiscount.discountFor(promo, 1_000_000, 900_000)).isEqualTo(10_000);
    }

    @Test
    void discountFor_ceilingAlsoCapsAFixedAmount() {
        PromoCode promo = new PromoCode();
        promo.setDiscountAmountMinor(30_000);
        promo.setMaxDiscountMinor(20_000);

        assertThat(PromoDiscount.discountFor(promo, 100_000)).isEqualTo(20_000);
        assertThat(PromoDiscount.discountFor(promo, 10_000)).isEqualTo(10_000); // still not above the subtotal
    }

    // ---------- the size of a case prize (V59) ----------

    private record SizedPrize(Order order, OrderItem line, Product product, ProductVariant m, ProductVariant l,
                              ProductVariant xl) {
    }

    /** An opened case whose prize (a product with sizes) holds one M; L has one left, XL none. */
    private SizedPrize sizedPrize(OrderStatus status) {
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
        o.setStatus(status);
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

    @Test
    void casePrizeSizesAreTheHeldOneAndThoseInStock() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        assertThat(service.casePrizeSizes(s.order())).extracting(OrderService.PrizeSize::name).containsExactly("M", "L");
        assertThat(service.casePrizeSizes(s.order()).get(0).current()).isTrue();
    }

    @Test
    void choosingAnotherSizeMovesTheHold() {
        SizedPrize s = sizedPrize(OrderStatus.APPROVED);
        service.chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.l().getId()));
        assertThat(s.m().getStock()).isEqualTo(4);
        assertThat(s.l().getStock()).isZero();
        assertThat(s.product().getStock()).isEqualTo(4); // rollup
        assertThat(s.line().getVariantId()).isEqualTo(s.l().getId());
        assertThat(s.line().getVariantNameSnapshot()).isEqualTo("L");
        assertThat(s.line().isVariantPending()).isFalse();
    }

    @Test
    void choosingTheHeldSizeOnlyConfirmsIt() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        service.chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.m().getId()));
        assertThat(s.m().getStock()).isEqualTo(3);
        assertThat(s.line().isVariantPending()).isFalse();
    }

    @Test
    void aSizeOutOfStockOrAShippedOrderIsRefused() {
        SizedPrize s = sizedPrize(OrderStatus.NEW);
        assertThatThrownBy(() -> service.chooseCasePrizeSize(s.order().getId(), UuidUtil.toString(s.xl().getId())))
                .isInstanceOf(BadRequestException.class);
        assertThat(s.line().isVariantPending()).isTrue();
        SizedPrize shipped = sizedPrize(OrderStatus.SHIPPED);
        assertThatThrownBy(() -> service.chooseCasePrizeSize(shipped.order().getId(), UuidUtil.toString(shipped.l().getId())))
                .isInstanceOf(BadRequestException.class);
        assertThat(shipped.l().getStock()).isEqualTo(1);
    }

    // ---------- monthly gift limit per person (GiftRegistryService) ----------

    /** A checkout of 2 500 ₴ that reaches a silver case: a 3 000 ₴ product prize (almost sure) or a discount. */
    private Order checkoutWithCase(long limitLeftMinor) {
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

        var tier = com.maxsolch.shop.gift.GiftCaseTier.Tier.SILVER;
        when(gift.giftConfig()).thenReturn(Optional.of(new com.maxsolch.shop.gift.GiftService.GiftConfig(null, 0,
                List.of(new com.maxsolch.shop.gift.GiftService.TierConfig(tier, 1_500_00, 0, 0, 0, List.of(
                        new com.maxsolch.shop.gift.GiftService.CaseEntry(1, tier,
                                com.maxsolch.shop.gift.GiftCaseItem.Kind.PRODUCT, prizeUuid, 0, 0, "COMMON", 1_000_000),
                        new com.maxsolch.shop.gift.GiftService.CaseEntry(2, tier,
                                com.maxsolch.shop.gift.GiftCaseItem.Kind.DISCOUNT, null, 5, 0, "RARE", 1)))))));
        when(giftRegistry.remainingMinor(any(), any())).thenReturn(limitLeftMinor);

        return service.createOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null));
    }

    @Test
    void createOrder_caseProductOverMonthlyLimit_dropsDiscountInstead() {
        Order order = checkoutWithCase(2_161_00);

        assertThat(order.getItems()).noneMatch(OrderItem::isGift);
        assertThat(order.getGiftCaseStatus()).isEqualTo(GiftCaseRules.GIFT_CASE_SEALED);
    }

    @Test
    void createOrder_caseProductWithinLimit_isGivenAtItsUsualPrice() {
        Order order = checkoutWithCase(5_000_00);

        OrderItem giftLine = order.getItems().stream().filter(OrderItem::isGift).findFirst().orElseThrow();
        assertThat(giftLine.getPriceMinorSnapshot()).isZero();
        assertThat(giftLine.getGiftValueMinor()).isEqualTo(3_000_00);
    }

    // ---------- characterization: manual order, exchange option, discount editing, granted case ----------

    @Test
    void createAdminOrder_withoutPayment_hasNoDeadlineAndNoMoneyMovement() {
        Product p = simpleProduct(10, 2_500);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        Order o = service.createAdminOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null),
                0, com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, "admin", null);

        assertThat(o.getPaymentDueAt()).isNull();
        assertThat(o.isPaid()).isFalse();
        assertThat(o.getReceivedMinor()).isZero();
        verify(moneyLedger, never()).record(any(), any(), any(), org.mockito.ArgumentMatchers.anyLong(), any(), any(),
                any(), any());
    }

    @Test
    void createAdminOrder_withPayment_booksItThroughTheChosenChannelWithTheDefaultNote() {
        Product p = simpleProduct(10, 2_500);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));
        when(orderRepository.findByIdForUpdate(any())).thenAnswer(inv -> Optional.of(capturedOrder()));

        Order o = service.createAdminOrder(cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 2)), null),
                3_000, com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, "admin", null);

        assertThat(o.getPaymentDueAt()).isNull();
        assertThat(o.getReceivedMinor()).isEqualTo(3_000);
        assertThat(o.isPaid()).isTrue();
        verify(moneyLedger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.PAYMENT),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH), eq(3_000L),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Source.ADMIN), eq("admin"),
                eq("оплата при ручном заказе"), any());
    }

    /** The order the last save() saw (the "database row" the lock query returns). */
    private Order capturedOrder() {
        ArgumentCaptor<Order> c = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository, org.mockito.Mockito.atLeastOnce()).save(c.capture());
        return c.getValue();
    }

    @Test
    void exchangePaymentOptionId_prefersTheOriginalsOptionThenTheFirstActiveOne() {
        Order original = new Order();
        original.setPaymentOptionId(fullPayment.getId());
        assertThat(service.exchangePaymentOptionId(original)).isEqualTo(UuidUtil.toString(fullPayment.getId()));

        Order gone = new Order();
        gone.setPaymentOptionId(UuidUtil.randomBytes());
        when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(fullPayment));
        assertThat(service.exchangePaymentOptionId(gone)).isEqualTo(UuidUtil.toString(fullPayment.getId()));

        when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of());
        assertThatThrownBy(() -> service.exchangePaymentOptionId(gone)).isInstanceOf(BadRequestException.class)
                .hasMessage("нет активного способа оплаты для нового заказа");
    }

    private Order orderWithOneLine(OrderStatus status, long price, int qty) {
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

    @Test
    void applyDiscount_manualAmountIsCappedAtTheSubtotal_percentIsCappedAtHundred() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 2);

        service.applyDiscount(o.getId(), null, 5_000L, null, false, false);
        assertThat(o.getDiscountMinor()).isEqualTo(5_000);
        assertThat(o.getTotalMinor()).isEqualTo(15_000);
        assertThat(o.getPromoCode()).isEqualTo("Ручная скидка");

        service.applyDiscount(o.getId(), null, 999_999L, null, false, false);
        assertThat(o.getDiscountMinor()).isEqualTo(20_000);
        assertThat(o.getTotalMinor()).isZero();
        assertThat(o.isPaid()).as("a free order counts as paid at once").isTrue();

        Order p = orderWithOneLine(OrderStatus.NEW, 10_000, 2);
        service.applyDiscount(p.getId(), null, null, 25, false, true);
        assertThat(p.getDiscountMinor()).isEqualTo(5_000);
        assertThat(p.getPromoCode()).isEqualTo("Ручная скидка 25%");
        service.applyDiscount(p.getId(), null, null, 400, false, true);
        assertThat(p.getDiscountMinor()).isEqualTo(20_000);
        verify(events, org.mockito.Mockito.atLeastOnce()).publishEvent(any(OrderEvents.Edited.class));
    }

    @Test
    void applyDiscount_clearReleasesTheRealPromoUsageAndDropsTheDiscount() {
        Order o = orderWithOneLine(OrderStatus.APPROVED, 10_000, 1);
        o.setPromoCode("SAVE10");
        o.setDiscountMinor(1_000);
        o.setTotalMinor(9_000);
        PromoCode code = new PromoCode();
        code.setCode("SAVE10");
        code.setUsesCount(3);
        when(promoCodeRepository.findByCodeForUpdate("SAVE10")).thenReturn(Optional.of(code));

        service.applyDiscount(o.getId(), null, null, null, true, false);

        assertThat(code.getUsesCount()).isEqualTo(2);
        assertThat(o.getPromoCode()).isNull();
        assertThat(o.getDiscountMinor()).isZero();
        assertThat(o.getTotalMinor()).isEqualTo(10_000);
    }

    @Test
    void applyDiscount_realCodeCountsOneUseAndGivesItsDiscount_shippedOrderIsRefused() {
        Order o = orderWithOneLine(OrderStatus.NEW, 10_000, 1);
        PromoCode code = new PromoCode();
        code.setCode("TEN");
        code.setActive(true);
        code.setDiscountPercent(10);
        code.setUsesCount(0);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("TEN")).thenReturn(Optional.of(code));

        service.applyDiscount(o.getId(), "TEN", null, null, false, false);

        assertThat(code.getUsesCount()).isEqualTo(1);
        assertThat(o.getDiscountMinor()).isEqualTo(1_000);
        assertThat(o.getPromoCode()).isEqualTo("TEN");

        Order shipped = orderWithOneLine(OrderStatus.SHIPPED, 10_000, 1);
        assertThatThrownBy(() -> service.applyDiscount(shipped.getId(), null, 100L, null, false, false))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("заказ можно менять только в статусе «Новый» или «Одобрен»");
    }

    @Test
    void grantGiftCase_drawsAPrizeSealsItAndNeedsAnOpenOrderWithoutACase() {
        var tier = com.maxsolch.shop.gift.GiftCaseTier.Tier.SILVER;
        String prizeUuid = UUID.randomUUID().toString();
        Product prize = new Product();
        prize.setId(UuidUtil.toBytes(prizeUuid));
        prize.setTitle("Prize");
        prize.setPriceMinor(3_000_00);
        prize.setStock(5);
        prize.setActive(true);
        prize.setVariants(new ArrayList<>());
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(prize));
        when(gift.tier(tier)).thenReturn(Optional.of(new com.maxsolch.shop.gift.GiftService.TierConfig(tier, 1_500_00,
                0, 0, 0, List.of(new com.maxsolch.shop.gift.GiftService.CaseEntry(1, tier,
                com.maxsolch.shop.gift.GiftCaseItem.Kind.PRODUCT, prizeUuid, 0, 0, "COMMON", 1_000_000)))));
        Order o = orderWithOneLine(OrderStatus.APPROVED, 10_000, 1);

        Order granted = service.grantGiftCase(o.getId(), tier, true);

        assertThat(granted.getGiftCaseStatus()).isEqualTo(GiftCaseRules.GIFT_CASE_SEALED);
        assertThat(granted.getGiftTier()).isEqualTo("SILVER");
        OrderItem line = granted.getItems().stream().filter(OrderItem::isGift).findFirst().orElseThrow();
        assertThat(line.getPriceMinorSnapshot()).isZero();
        assertThat(prize.getStock()).isEqualTo(4);
        verify(gift).saveOrderCase(any());
        // a second case is refused
        assertThatThrownBy(() -> service.grantGiftCase(o.getId(), tier, false))
                .isInstanceOf(BadRequestException.class).hasMessage("У заказа уже есть кейс");
        // and so is a closed order
        Order shipped = orderWithOneLine(OrderStatus.SHIPPED, 10_000, 1);
        assertThatThrownBy(() -> service.grantGiftCase(shipped.getId(), tier, false))
                .isInstanceOf(BadRequestException.class);
    }
}
