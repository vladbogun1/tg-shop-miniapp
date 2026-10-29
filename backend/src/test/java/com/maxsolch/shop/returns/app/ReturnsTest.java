package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderApp;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.order.app.StockFixtures;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Registering a return: the simple one and the wizard (V68), the plan check, partial pickup at the branch. */
class ReturnsTest extends ReturnsTestBase {

    @Test
    void registerReturn_newOrderAfterCheaperExchange_refundsOnlyTheOverpayment() {
        Order o = order(OrderStatus.NEW);
        o.setTotalMinor(5_000);
        o.setReceivedMinor(20_000);

        assertThatThrownBy(() -> returns.register(o.getId(), List.of(), 16_000, null))
                .isInstanceOf(DomainException.BadRequest.class);
        OrderChange r = returns.register(o.getId(), List.of(), 15_000, "разница за обмен");

        assertThat(r.order().getRefundedMinor()).isEqualTo(15_000);
        assertThatThrownBy(() -> returns.register(o.getId(), List.of(), 1_000, null))
                .isInstanceOf(DomainException.BadRequest.class); // nothing overpaid any more
    }

    @Test
    void registerReturn_partial_restocksOnlyChosenUnits_andRecordsRefund() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        Product mouse = product(5);
        Product pad = product(2);
        OrderItem a = item(o, mouse, 1L, 2);
        OrderItem b = item(o, pad, 2L, 1);
        when(productRepository.findByIdForUpdate(mouse.getId())).thenReturn(Optional.of(mouse));

        OrderChange r = returns.register(o.getId(), List.of(
                new Returns.ReturnLine(1L, 1, true),
                new Returns.ReturnLine(2L, 1, false)), 15_000, "брак коврика");

        assertThat(mouse.getStock()).isEqualTo(6);
        assertThat(pad.getStock()).isEqualTo(2); // not sellable — stays off the shelf
        assertThat(a.getReturnedQty()).isEqualTo(1);
        assertThat(a.getRestockedQty()).isEqualTo(1);
        assertThat(b.getReturnedQty()).isEqualTo(1);
        assertThat(b.getRestockedQty()).isZero();
        assertThat(r.order().getRefundedMinor()).isEqualTo(15_000);
        assertThat(r.order().getReturnedAt()).isNotNull();
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(r.auditDetails()).contains("150 ₴").contains("брак коврика");
    }

    @Test
    void registerReturn_moreThanOrdered_isRejected() {
        Order o = order(OrderStatus.SHIPPED);
        Product mouse = product(5);
        OrderItem a = item(o, mouse, 1L, 2);
        a.setReturnedQty(2);

        assertThatThrownBy(() -> returns.register(o.getId(),
                List.of(new Returns.ReturnLine(1L, 1, true)), 0, null))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("не больше 0");
    }

    @Test
    void registerReturn_refundAboveReceived_isRejected() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(5_000);

        assertThatThrownBy(() -> returns.register(o.getId(), List.of(), 6_000, null))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void registerReturn_rejectedOrder_allowsRefundOnly() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        Product mouse = product(5);
        item(o, mouse, 1L, 1);

        assertThatThrownBy(() -> returns.register(o.getId(),
                List.of(new Returns.ReturnLine(1L, 1, true)), 0, null))
                .isInstanceOf(DomainException.BadRequest.class);

        OrderChange r = returns.register(o.getId(), List.of(), 10_000, null);
        assertThat(r.order().getRefundedMinor()).isEqualTo(10_000);
    }

    @Test
    void registerReturn_nothingGiven_isRejected() {
        Order o = order(OrderStatus.DELIVERED);

        assertThatThrownBy(() -> returns.register(o.getId(), List.of(), 0, null))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void wizard_rejectedOrder_retainsPrepaymentAndRefundsTheRest_inTheJournal() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(30_000);
        MoneyLedger ledger = wireLedger();

        OrderChange r = returns.registerPlan(o.getId(), plan(List.of(),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 20_000, null)),
                10_000, 0), "owner");

        assertThat(r.order().getRefundedMinor()).isEqualTo(20_000);
        assertThat(r.order().getReturnedAt()).isNotNull();
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER), eq(20_000L),
                any(), eq("owner"), any(), any());
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.RETAINED),
                any(), eq(10_000L), any(), eq("owner"), any(), any());
        assertThat(r.auditDetails()).contains("удержано").contains("перевод на карту");
    }

    @Test
    void wizard_moreThanReceived_isRejected() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(2_000);
        wireLedger();

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(List.of(),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, 5_000, null)),
                4_000, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(o.getRefundedMinor()).isEqualTo(2_000);
    }

    @Test
    void wizard_rejectedOrder_withGoods_isRejected() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        Product p = product(0);
        item(o, p, 1L, 1);

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.RESTOCK)),
                List.of(), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void wizard_refundWithoutChannel_isRejected() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(List.of(),
                List.of(new ManualRefund(null, 1_000, null)), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void wizard_defect_isWrittenOffAtThePaidPrice_notRestocked() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setSubtotalMinor(20_000);
        o.setDiscountMinor(2_000);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 2);
        wireLedger();

        returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.DEFECT)),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 9_000, null)),
                0, 0), "owner");

        assertThat(it.getReturnedQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isZero();
        assertThat(p.getStock()).isZero();
        ArgumentCaptor<com.maxsolch.shop.inventory.domain.StockWriteoff> w =
                ArgumentCaptor.forClass(com.maxsolch.shop.inventory.domain.StockWriteoff.class);
        verify(writeoffs).save(w.capture());
        assertThat(w.getValue().getQuantity()).isEqualTo(1);
        // 10 000 at −10 % order discount
        assertThat(w.getValue().getUnitValueMinor()).isEqualTo(9_000);
        assertThat(w.getValue().getReason()).isEqualTo("DEFECT");
    }

    @Test
    void wizard_prepaymentAlreadyRetainedOnRefusal_cannotBeKeptOrRefundedAgain() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(20_000);
        MoneyLedger ledger = wireLedger();
        when(ledger.retainedMinor(o.getId())).thenReturn(20_000L);

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(List.of(), List.of(), 20_000, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("уже удержанных");
        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(List.of(),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, 1_000, null)), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void wizard_monoAlreadySent_isLeftOutOfTheLimit() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(10_000); // the bank refund is already booked by the time the books are written
        wireLedger();

        OrderChange r = returns.registerPlan(o.getId(), plan(List.of(), List.of(), 0, 10_000),
                "owner", true);
        assertThat(r.auditDetails()).contains("monobank");
    }

    @Test
    void wizard_inTransit_countsTheUnitsReturned_butKeepsThemOffTheShelf() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        Product mouse = product(0);
        OrderItem it = item(o, mouse, 1L, 3);
        wireLedger();

        OrderChange r = returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner");

        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(r.order().getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(r.order().getReturnSentAt()).isNotNull();
        assertThat(it.getReturnedQty()).isEqualTo(1);
        assertThat(it.getReturnPendingQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isZero();
        assertThat(mouse.getStock()).isZero();
        assertThat(r.auditDetails()).contains("едет назад");
    }

    @Test
    void wizard_shippedParcelRefusedWhole_isARejectionNotAPartialPickup() {
        Order o = order(OrderStatus.SHIPPED);
        o.setReceivedMinor(30_000);
        item(o, product(0), 1L, 1);

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("не забрал ничего");
    }

    @Test
    void wizard_partialPickupWithCod_refusedPartComesOffNalozhka_andDeliveryBooksOnlyTheRest() {
        // 1C60C7C7: prepayment 100 ₴, the customer took the keyboard and refused the mouse at the branch.
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(30_000);
        o.setSubtotalMinor(30_000);
        o.setPrepaymentMinor(100);
        o.setReceivedMinor(100);
        o.setPaid(true);
        Product mouse = product(0);
        OrderItem keyboard = item(o, product(0), 1L, 2);
        OrderItem refused = item(o, mouse, 2L, 1);

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(2L, 1, LineOutcome.IN_TRANSIT)),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 100, null)), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("вернуть нечего");

        OrderChange r = returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(2L, 1, LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner");

        assertThat(r.order().getUncollectedMinor()).isEqualTo(10_000);
        assertThat(r.order().getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(refused.getReturnPendingQty()).isEqualTo(1);
        assertThat(keyboard.getReturnedQty()).isZero();
        assertThat(mouse.getStock()).isZero(); // on its way, not on the shelf yet
        assertThat(OrderMoney.codMinor(r.order())).isEqualTo(19_900);
        assertThat(r.auditDetails()).contains("не выкуплено на почте 100 ₴").contains("наложка теперь 199 ₴");

        OrderApp app = OrderApp.create(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), org.mockito.Mockito.mock(MoneyLedger.class));
        Order delivered = app.lifecycle().deliver(o.getId());

        assertThat(delivered.getReceivedMinor()).isEqualTo(20_000);
        assertThat(OrderMoney.codMinor(delivered)).isZero();
    }

    @Test
    void wizard_partialPickupWithADiscount_refusingALineInStepsNeverExceedsItsPaidAmount() {
        // 3333 x 3 with 10 ₴ off: the line cost 89.99 (total), not 90.00.
        Order o = order(OrderStatus.SHIPPED);
        o.setSubtotalMinor(9_999);
        o.setDiscountMinor(1_000);
        o.setTotalMinor(8_999);
        OrderItem line = item(o, product(0), 1L, 3);
        line.setPriceMinorSnapshot(3_333);
        List<WizardLine> one =
                List.of(new WizardLine(1L, 1, LineOutcome.IN_TRANSIT));

        assertThat(returns.registerPlan(o.getId(), plan(one, List.of(), 0, 0), "owner")
                .order().getUncollectedMinor()).isEqualTo(2_999);
        assertThat(returns.registerPlan(o.getId(), plan(one, List.of(), 0, 0), "owner")
                .order().getUncollectedMinor()).isEqualTo(5_999);   // 2999 + 3000 = floor(8999 * 2 / 3)
        assertThat(line.getReturnedQty()).isEqualTo(2);
        assertThat(OrderMoney.codMinor(o)).isEqualTo(3_000);        // the last unit: 8999 - 5999
    }

    @Test
    void wizard_partialPickupOfAPrepaidOrder_refundsTheRefusedPart() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(30_000);
        o.setSubtotalMinor(30_000);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        item(o, product(0), 1L, 2);
        item(o, product(0), 2L, 1);
        List<WizardLine> back =
                List.of(new WizardLine(2L, 1, LineOutcome.IN_TRANSIT));

        assertThatThrownBy(() -> returns.registerPlan(o.getId(), plan(back,
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_001, null)), 0, 0), "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("100 ₴");

        OrderChange r = returns.registerPlan(o.getId(), plan(back,
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_000, null)), 0, 0), "owner");

        assertThat(r.order().getUncollectedMinor()).isEqualTo(10_000);
        assertThat(r.order().getRefundedMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.codMinor(r.order())).isZero();
    }

    @Test
    void checkReturnPlan_refusesWhatTheWizardWouldRefuse_andChangesNothing() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        Product p = product(3);
        OrderItem it = item(o, p, 1L, 2);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o)); // the check reads, it does not lock

        // a good plan passes and touches nothing: no stock, no money, no events
        returns.checkPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 2, LineOutcome.RESTOCK)),
                List.of(new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, 10_000, null)),
                0, 0));
        assertThat(it.getReturnedQty()).isZero();
        assertThat(o.getRefundedMinor()).isZero();
        assertThat(p.getStock()).isEqualTo(3);
        verify(events, never()).publishEvent(any());
        verify(orderRepository, never()).save(any(Order.class));

        // more than ordered
        assertThatThrownBy(() -> returns.checkPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 3, LineOutcome.RESTOCK)),
                List.of(), 0, 0)))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("можно вернуть не больше 2 шт.");
        // unknown line
        assertThatThrownBy(() -> returns.checkPlan(o.getId(), plan(
                List.of(new WizardLine(99L, 1, LineOutcome.RESTOCK)),
                List.of(), 0, 0)))
                .isInstanceOf(DomainException.NotFound.class);
        // more money than was received
        assertThatThrownBy(() -> returns.checkPlan(o.getId(), plan(List.of(), List.of(
                new ManualRefund(
                        com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.CASH, 40_000, null)), 0, 0)))
                .isInstanceOf(DomainException.BadRequest.class);
        // KEPT (compensation) is not limited by what is left in the order
        returns.checkPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 5, LineOutcome.KEPT)),
                List.of(), 0, 0));
    }

}
