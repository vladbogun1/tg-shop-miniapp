package com.maxsolch.shop.order.app;

import com.maxsolch.shop.inventory.domain.InventoryError;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.cart.domain.CartRules;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.promo.domain.PromoCode;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Checkout: placing an order (stock, promo, gift limit) and the admin manual order. */
class CheckoutTest extends OrderScenarioTestBase {

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
        verify(events).publish(any(OrderEvents.Created.class));

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
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.PAYMENT_METHOD_REQUIRED));
        verify(orderRepository, never()).save(any());
    }

    @Test
    void createOrder_inactivePaymentOption_throws() {
        fullPayment.setActive(false);
        CreateOrderCommand command = cmd(List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.PAYMENT_METHOD_UNKNOWN));
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
                .isInstanceOf(DomainException.BadRequest.class);
        verify(cartService, never()).removeOrdered(org.mockito.ArgumentMatchers.anyLong(), any());
    }

    @Test
    void createOrder_outOfStock_throws() {
        Product p = simpleProduct(1, 1_000);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 5)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(InventoryError.OUT_OF_STOCK));
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
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.VARIANT_REQUIRED));
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
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.VARIANT_MISMATCH));
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
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(InventoryError.OUT_OF_STOCK));
    }

    @Test
    void createOrder_emptyItems_throws() {
        CreateOrderCommand command = cmd(List.of(), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.NO_ITEMS));
    }

    @Test
    void createOrder_inactiveProduct_throws() {
        Product p = simpleProduct(10, 1_000);
        p.setActive(false);
        when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.PRODUCT_UNAVAILABLE));
    }

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
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.PROMO_REJECTED_CASE_EXCLUDED));
        assertThat(promo.getUsesCount()).isZero();
    }

    @Test
    void createOrder_casePromo_onlyLowMarginProducts_isRefusedAndNotUsed() {
        String mouse = lowMarginCart();
        PromoCode promo = casePromo("CASE10", 10);

        assertThatThrownBy(() -> service.createOrder(cmd(List.of(new CreateOrderCommand.Line(mouse, null, 1)), "CASE10")))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(OrderError.PROMO_REJECTED_CASE_EXCLUDED));
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
                .isInstanceOf(DomainException.BadRequest.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(DomainException.BadRequest.class))
                .extracting(DomainException.BadRequest::getCode)
                .isEqualTo(OrderError.PROMO_REJECTED.code());
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

    @Test
    void exchangePaymentOptionId_prefersTheOriginalsOptionThenTheFirstActiveOne() {
        Order original = new Order();
        OrderFixtures.set(original, "paymentOptionId", fullPayment.getId());
        assertThat(service.exchangePaymentOptionId(original)).isEqualTo(UuidUtil.toString(fullPayment.getId()));

        Order gone = new Order();
        OrderFixtures.set(gone, "paymentOptionId", UuidUtil.randomBytes());
        when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(fullPayment));
        assertThat(service.exchangePaymentOptionId(gone)).isEqualTo(UuidUtil.toString(fullPayment.getId()));

        when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of());
        assertThatThrownBy(() -> service.exchangePaymentOptionId(gone)).isInstanceOf(DomainException.BadRequest.class)
                .hasMessage("нет активного способа оплаты для нового заказа");
    }
}
