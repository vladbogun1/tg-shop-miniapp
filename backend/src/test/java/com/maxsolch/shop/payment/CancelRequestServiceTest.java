package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CancelRequestServiceTest {

    @Mock
    OrderService orderService;
    @Mock
    OnlinePaymentService payments;
    @Mock
    PaymentInvoiceRepository invoices;
    @Mock
    Messages messages;

    CancelRequestService service;
    final byte[] orderId = UuidUtil.randomBytes();

    @BeforeEach
    void setUp() {
        service = new CancelRequestService(orderService, payments, invoices, messages);
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static PaymentInvoice paid(String id, long amount, long refunded) {
        PaymentInvoice i = new PaymentInvoice();
        i.setExternalId(id);
        i.setAmountMinor(amount);
        i.setRefundedMinor(refunded);
        i.setStatus(PaymentInvoice.SUCCESS);
        i.setAppliedAt(Instant.now());
        return i;
    }

    private Order rejected(long received) {
        Order o = new Order();
        o.setId(orderId);
        o.setStatus(OrderStatus.REJECTED);
        o.setTotalMinor(100_000);
        o.setReceivedMinor(received);
        return o;
    }

    @Test
    void approve_rejectsFirst_thenRefundsEveryPaidInvoiceInFull() {
        PaymentInvoice failed = new PaymentInvoice();
        failed.setExternalId("inv-failed");
        failed.setStatus(PaymentInvoice.FAILURE);
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId))
                .thenReturn(List.of(paid("inv-1", 10_000, 0), failed, paid("inv-2", 90_000, 0)));
        when(orderService.approveCancelRequest(orderId, null)).thenReturn(rejected(100_000));
        when(orderService.get(orderId)).thenReturn(rejected(100_000));

        CancelRequestService.ApproveResult r = service.approve(orderId, null);

        InOrder order = inOrder(orderService, payments);
        order.verify(orderService).approveCancelRequest(orderId, null);
        order.verify(payments).refund(eq(orderId), eq("inv-1"), isNull());
        verify(payments).refund(eq(orderId), eq("inv-2"), isNull());
        verify(payments, never()).refund(any(), eq("inv-failed"), any());
        assertThat(r.refundRequestedMinor()).isEqualTo(100_000);
        assertThat(r.refundedInvoices()).isEqualTo(2);
        assertThat(r.refundErrors()).isEmpty();
        assertThat(r.manualRefundMinor()).isZero();
    }

    @Test
    void approve_reportsRefundFailures_andHandRecordedMoney() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(paid("inv-1", 10_000, 0)));
        doThrow(new BadRequestException("monobank отклонил возврат")).when(payments).refund(orderId, "inv-1", null);
        when(orderService.approveCancelRequest(orderId, "ok")).thenReturn(rejected(30_000));
        when(orderService.get(orderId)).thenReturn(rejected(30_000));

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
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((BadRequestException) e).getCode())
                        .isEqualTo(CancelRequestService.PAYMENT_IN_PROGRESS));
        verify(orderService, never()).approveCancelRequest(any(), any());
        verify(payments, never()).refund(any(), any(), any());
    }

    @Test
    void decline_doesNotTouchMoney() {
        service.decline(orderId, "вже відправили");
        verify(orderService).declineCancelRequest(orderId, "вже відправили");
        verify(payments, never()).refund(any(), any(), any());
    }

    @Test
    void cancelUnpaid_closesPaymentPages() {
        when(orderService.cancelByCustomer(orderId, null)).thenReturn(rejected(0));
        service.cancelUnpaid(orderId, null);
        verify(payments).refreshOrder(orderId);
        verify(payments).closeOpenInvoices(orderId);
    }

    @Test
    void request_whileBankProcesses_isRefused() {
        when(payments.hasPaymentInFlight(orderId)).thenReturn(true);
        assertThatThrownBy(() -> service.request(orderId, "причина"))
                .hasMessage("api.payment.inProgress");
        verify(orderService, never()).requestCancel(any(), any());
    }
}
