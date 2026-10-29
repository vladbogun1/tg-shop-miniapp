package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CancelRequestServiceTest {

    @Mock
    OrderLookup orderQueries;
    @Mock
    CancelRequests cancelRequests;
    @Mock
    OrderOnlinePayments payments;
    @Mock
    Messages messages;

    CancelRequestService service;
    final byte[] orderId = UuidUtil.randomBytes();

    @BeforeEach
    void setUp() {
        service = new CancelRequestService(orderQueries, cancelRequests, payments, messages);
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private Order rejected(long received) {
        Order o = new Order();
        o.setId(orderId);
        OrderStates.withStatus(o, OrderStatus.REJECTED);
        o.setTotalMinor(100_000);
        o.setReceivedMinor(received);
        return o;
    }

    @Test
    void approve_rejectsFirst_thenRefundsThroughPayments() {
        when(payments.refundAll(orderId))
                .thenReturn(new OrderOnlinePayments.RefundAll(100_000, 100_000, 2, List.of()));
        when(cancelRequests.approveCancelRequest(orderId, null)).thenReturn(rejected(100_000));
        when(orderQueries.get(orderId)).thenReturn(rejected(100_000));

        CancelRequestService.ApproveResult r = service.approve(orderId, null);

        InOrder order = inOrder(cancelRequests, payments);
        order.verify(cancelRequests).approveCancelRequest(orderId, null);
        order.verify(payments).closeOpenInvoices(orderId);
        order.verify(payments).refundAll(orderId);
        assertThat(r.refundRequestedMinor()).isEqualTo(100_000);
        assertThat(r.refundedInvoices()).isEqualTo(2);
        assertThat(r.refundErrors()).isEmpty();
        assertThat(r.manualRefundMinor()).isZero();
    }

    @Test
    void approve_reportsRefundFailures_andHandRecordedMoney() {
        when(payments.refundAll(orderId))
                .thenReturn(new OrderOnlinePayments.RefundAll(10_000, 0, 0, List.of("inv-1: monobank отклонил возврат")));
        when(cancelRequests.approveCancelRequest(orderId, "ok")).thenReturn(rejected(30_000));
        when(orderQueries.get(orderId)).thenReturn(rejected(30_000));

        CancelRequestService.ApproveResult r = service.approve(orderId, "ok");

        assertThat(r.refundRequestedMinor()).isZero();
        assertThat(r.refundErrors()).hasSize(1);
        // 30 000 received, 10 000 of it via monobank → 20 000 recorded by hand
        assertThat(r.manualRefundMinor()).isEqualTo(20_000);
    }

    @Test
    void approve_whileBankProcesses_isRefused_nothingChanges() {
        when(payments.hasPaymentInFlight(orderId)).thenReturn(true);
        assertThatThrownBy(() -> service.approve(orderId, null))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException.BadRequest) e).getCode())
                        .isEqualTo(CancelRequestService.PAYMENT_IN_PROGRESS));
        verify(cancelRequests, never()).approveCancelRequest(any(), any());
        verify(payments, never()).refundAll(any());
    }

    @Test
    void decline_doesNotTouchMoney() {
        service.decline(orderId, "вже відправили");
        verify(cancelRequests).declineCancelRequest(orderId, "вже відправили");
        verify(payments, never()).refundAll(any());
    }

    @Test
    void cancelUnpaid_closesPaymentPages() {
        when(cancelRequests.cancelByCustomer(orderId, null)).thenReturn(rejected(0));
        service.cancelUnpaid(orderId, null);
        verify(payments).refresh(orderId);
        verify(payments).closeOpenInvoices(orderId);
    }

    @Test
    void request_whileBankProcesses_isRefused() {
        when(payments.hasPaymentInFlight(orderId)).thenReturn(true);
        assertThatThrownBy(() -> service.request(orderId, "причина"))
                .hasMessage("api.payment.inProgress");
        verify(cancelRequests, never()).requestCancel(any(), any());
    }
}
