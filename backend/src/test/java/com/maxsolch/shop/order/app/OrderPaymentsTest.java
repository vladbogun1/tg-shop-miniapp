package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.time.Instant;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** OrderPayments: money received online or by the admin, refunds. */
class OrderPaymentsTest extends OrderScenarioTestBase {

    @Test
    void recordOnlinePayment_creditsTheMoneyMarksPaidAndKeepsTheStatus() {
        Order o = persistedOrder(OrderStatus.NEW);
        o.setTotalMinor(50_000);
        o.setPrepaymentMinor(10_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = payments.recordOnlinePayment(o.getId(), 10_000);

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

        Order paid = payments.recordOnlinePayment(o.getId(), 20_000);

        assertThat(paid.getReceivedMinor()).isEqualTo(30_000);
        assertThat(paid.getPaidAt()).isEqualTo(paidAt); // the first payment time is kept
        assertThat(OrderMoney.codMinor(paid)).isZero();
    }

    @Test
    void recordOnlineRefund_addsToRefunded() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        o.setRefundedMinor(1_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThat(payments.recordOnlineRefund(o.getId(), 4_000).getRefundedMinor()).isEqualTo(5_000);
    }

    @Test
    void markPaid_recordsTheAmountAndShrinksCod() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = payments.markPaid(o.getId(), 10_000);

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

        assertThatThrownBy(() -> payments.markPaid(o.getId(), 999_999))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("больше суммы заказа");
        assertThat(o.getReceivedMinor()).isZero();
        verify(orderRepository, never()).save(any());
    }

    @Test
    void markPaid_fullTotalIsAccepted() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order paid = payments.markPaid(o.getId(), 50_000);

        assertThat(paid.getReceivedMinor()).isEqualTo(50_000);
        assertThat(OrderMoney.codMinor(paid)).isZero();
    }

    @Test
    void markPaid_withZeroClearsThePayment() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        o.setPaid(true);
        o.setReceivedMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order cleared = payments.markPaid(o.getId(), 0);

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

        Order fixed = payments.markPaid(o.getId(), 50_000);

        assertThat(fixed.getReceivedMinor()).isEqualTo(50_000);
        assertThat(fixed.getPaidAt()).isEqualTo(paidAt);
    }

    @Test
    void markPaid_firstPayment_isDatedNow() {
        Order o = persistedOrder(OrderStatus.APPROVED);
        o.setTotalMinor(50_000);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        Instant before = Instant.now();

        Order paid = payments.markPaid(o.getId(), 10_000);

        assertThat(paid.getPaidAt()).isNotNull().isAfterOrEqualTo(before);
    }
}
