package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderApp;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderEvents;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.order.app.StockFixtures;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Exchange on a delivered order (V69): the replacement order, the moved credit, the exchange record and its cancel. */
class ExchangesTest extends ReturnsTestBase {

    @Test
    void exchange_deliveredOrderKeepsItsTracking_replacementIsANewLinkedOrder() {
        Order o = order(OrderStatus.DELIVERED);
        o.setTrackingNumber("20450000000000");
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(20_000);
        o.setPaid(true);
        o.setUserId(77L);
        Product mouse = product(5);
        Product other = product(3);
        other.setTitle("Клава");
        other.setPriceMinor(15_000);
        item(o, mouse, 1L, 2);
        o.setSubtotalMinor(20_000);
        o.setTotalMinor(20_000);
        List<Order> all = trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderChange r = exchanges.exchange(o.getId(),
                List.of(new WizardLine(1L, 1, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, "не подошёл цвет", "admin");

        // The delivered order stays where it was; the unit is on its way back.
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(o.getTrackingNumber()).isEqualTo("20450000000000");
        assertThat(o.getItems().get(0).getReturnPendingQty()).isEqualTo(1);
        assertThat(o.getReturnStatus()).isEqualTo(Order.RETURN_IN_TRANSIT);
        assertThat(o.getRefundedMinor()).isEqualTo(10_000);       // paid value moved over
        assertThat(mouse.getStock()).isEqualTo(5);                // not on the shelf yet

        Order child = r.order();
        assertThat(child).isNotSameAs(o);
        assertThat(all).contains(child);
        assertThat(child.getExchangeOfOrderId()).isEqualTo(o.getId());
        assertThat(child.getUserId()).isEqualTo(77L);
        assertThat(child.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(child.getTrackingNumber()).isNull();
        assertThat(child.getTotalMinor()).isEqualTo(15_000);
        assertThat(child.getReceivedMinor()).isEqualTo(10_000);   // credit; 50 ₴ to pay
        assertThat(child.getPaymentDueAt()).isNull();
        // The difference can be paid online in full (or наложкой): no prepayment cap.
        assertThat(child.getPrepaymentMinor()).isZero();
        assertThat(OrderMoney.amountDueMinor(child)).isEqualTo(5_000);
        assertThat(other.getStock()).isEqualTo(2);                // reserved for the new parcel
        assertThat(r.auditDetails()).contains("Клава").contains("зачтено 100 ₴").contains("доплата 50 ₴");

        ArgumentCaptor<com.maxsolch.shop.returns.domain.OrderExchange> ex =
                ArgumentCaptor.forClass(com.maxsolch.shop.returns.domain.OrderExchange.class);
        verify(exchangeRepository).save(ex.capture());
        assertThat(ex.getValue().getOrderId()).isEqualTo(o.getId());
        assertThat(ex.getValue().getNewOrderId()).isEqualTo(child.getId());
        assertThat(ex.getValue().getReturnedSummary()).contains("(едет назад)");
        assertThat(ex.getValue().getTotalBeforeMinor()).isEqualTo(10_000);
        verify(events).publishEvent(any(OrderEvents.Exchanged.class));
    }

    @Test
    void exchange_creditFollowsTheExactPaidAmountOfTheLine() {
        // 3333 x 3 with 10 ₴ off, paid 89.99: exchanging all three moves exactly 89.99 over, not 90.00.
        Order o = order(OrderStatus.DELIVERED);
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(8_999);
        o.setPaid(true);
        o.setUserId(77L);
        Product other = product(3);
        other.setPriceMinor(20_000);
        OrderItem line = item(o, product(5), 1L, 3);
        line.setPriceMinorSnapshot(3_333);
        o.setSubtotalMinor(9_999);
        o.setDiscountMinor(1_000);
        o.setTotalMinor(8_999);
        trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        exchanges.exchange(o.getId(),
                List.of(new WizardLine(1L, 3, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin");

        assertThat(o.getRefundedMinor()).isEqualTo(8_999);
    }

    @Test
    void exchange_alreadyAtTheShop_writeOff_cheaperReplacementLeavesTheRestRefundable() {
        Order o = order(OrderStatus.DELIVERED);
        Product mouse = product(5);
        Product other = product(3);
        other.setPriceMinor(5_000);
        item(o, mouse, 1L, 1);
        o.setSubtotalMinor(10_000);
        o.setTotalMinor(10_000);
        o.setReceivedMinor(10_000);
        trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderChange r = exchanges.exchange(o.getId(),
                List.of(new WizardLine(1L, 1, LineOutcome.DEFECT)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.APPROVED, false, null, "admin");

        assertThat(mouse.getStock()).isEqualTo(5);                // written off, not restocked
        assertThat(o.getItems().get(0).getReturnedQty()).isEqualTo(1);
        assertThat(o.getReturnStatus()).isNull();
        assertThat(o.getRefundedMinor()).isEqualTo(5_000);        // only what the new order takes
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(r.order().getApprovedAt()).isNotNull();
        assertThat(r.order().isPaid()).isTrue();
        assertThat(r.auditDetails()).contains("к возврату 50 ₴").contains("брак");
    }

    @Test
    void exchange_notDelivered_keptGoods_orWithoutReplacement_isRejected() {
        Product mouse = product(5);
        Order shipped = order(OrderStatus.SHIPPED);
        item(shipped, mouse, 1L, 1);
        assertThatThrownBy(() -> exchanges.exchange(shipped.getId(),
                List.of(new WizardLine(1L, 1, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("после доставки");

        Order delivered = order(OrderStatus.DELIVERED);
        item(delivered, mouse, 2L, 1);
        assertThatThrownBy(() -> exchanges.exchange(delivered.getId(),
                List.of(new WizardLine(2L, 1, null)), List.of(),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> exchanges.exchange(delivered.getId(),
                List.of(new WizardLine(2L, 1, LineOutcome.KEPT)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> exchanges.exchange(delivered.getId(),
                List.of(new WizardLine(2L, 2, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class);
        verify(events, never()).publishEvent(any());
    }

    @Test
    void deliver_afterCheaperExchange_keepsTheOverpayment() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(5_000);
        o.setReceivedMinor(10_000);
        o.setPaid(true);
        OrderApp app = OrderApp.create(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), org.mockito.Mockito.mock(MoneyLedger.class));

        Order delivered = app.lifecycle().deliver(o.getId());

        assertThat(delivered.getReceivedMinor()).isEqualTo(10_000);
    }

    @Test
    void exchange_isLinkedToItsReturnRecord_andCancellingItRejectsTheReplacementAndTakesTheCreditBack() {
        Product mouse = product(5);
        Product other = product(3);
        other.setTitle("Клава");
        other.setPriceMinor(15_000);
        Order o = deliveredOrderForExchange(mouse);
        List<Order> all = trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);
        wireExchanges();

        OrderChange made = exchanges.exchange(o.getId(),
                List.of(new WizardLine(1L, 1, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin");
        Order child = made.order();

        // the return registered by the exchange is the exchange's own record
        assertThat(recs).hasSize(1);
        assertThat(recs.get(0).getKind()).isEqualTo("EXCHANGE");
        assertThat(recs.get(0).getExchangeId()).isEqualTo(5L);
        assertThat(recs.get(0).getRefundMinor()).isEqualTo(10_000);
        assertThat(other.getStock()).isEqualTo(2);

        OrderChange r = cancellation.cancel(o.getId(), recs.get(0).getId(), null,
                "передумал", "owner");

        assertThat(child.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(other.getStock()).isEqualTo(3);                 // the replacement's stock is released
        assertThat(child.getRefundedMinor()).isEqualTo(10_000);    // the moved credit leaves the new order
        assertThat(o.getRefundedMinor()).isZero();                 // ... and is not counted as refunded here any more
        assertThat(o.getItems().get(0).getReturnedQty()).isZero();
        assertThat(o.getItems().get(0).getReturnPendingQty()).isZero();
        assertThat(o.getReturnStatus()).isNull();
        assertThat(o.getReturnedAt()).isNull();
        assertThat(recs.get(0).getCancelledAt()).isNotNull();
        assertThat(recs.get(0).getCancelledBy()).isEqualTo("owner");
        assertThat(all).contains(child);
        ArgumentCaptor<com.maxsolch.shop.returns.domain.OrderExchange> ex =
                ArgumentCaptor.forClass(com.maxsolch.shop.returns.domain.OrderExchange.class);
        verify(exchangeRepository, org.mockito.Mockito.atLeast(2)).save(ex.capture());
        assertThat(ex.getValue().getCancelledAt()).isNotNull();
        assertThat(ex.getValue().getCancelledBy()).isEqualTo("owner");
        assertThat(r.order()).isSameAs(o);
        assertThat(r.auditDetails()).startsWith("обмен отменён: ").contains("замена #").contains("передумал");
        verify(ledgerMock).record(eq(child.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.EXCHANGE), eq(10_000L), any(), eq("owner"),
                any(), any());
        verify(ledgerMock).record(eq(o.getId()), eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel.EXCHANGE), eq(-10_000L), any(), eq("owner"),
                any(), any());
    }

    @Test
    void cancelReturn_exchangeWhoseReplacementShipped_isRefusedAndNothingChanges() {
        Product mouse = product(5);
        Product other = product(3);
        other.setPriceMinor(15_000);
        Order o = deliveredOrderForExchange(mouse);
        trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);
        wireExchanges();
        Order child = exchanges.exchange(o.getId(),
                List.of(new WizardLine(1L, 1, null)),
                List.of(new Exchanges.NewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin").order();
        OrderStates.withStatus(child, OrderStatus.SHIPPED);

        assertThatThrownBy(() -> cancellation.cancel(o.getId(), recs.get(0).getId(), null, "передумал", "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("уже отправили");
        assertThat(recs.get(0).getCancelledAt()).isNull();
        assertThat(o.getRefundedMinor()).isEqualTo(10_000);
        assertThat(child.getStatus()).isEqualTo(OrderStatus.SHIPPED);
    }

}
