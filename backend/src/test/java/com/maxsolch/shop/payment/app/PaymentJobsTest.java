package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.order.app.OrderLifecycle;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PaymentJobsTest {

    private final OnlinePaymentService payments = mock(OnlinePaymentService.class);
    private final PaymentInvoiceRepository invoices = mock(PaymentInvoiceRepository.class);
    private final OrderLookup orders = mock(OrderLookup.class);
    private final OrderLifecycle lifecycle = mock(OrderLifecycle.class);
    private final Instant now = Instant.parse("2026-11-01T10:00:00Z");
    private final PaymentJobs jobs = new PaymentJobs(payments, invoices, orders, lifecycle, mock(ActivityLog.class),
            Clock.fixed(now, ZoneOffset.UTC));

    private static PaymentInvoice invoice(String ext) {
        PaymentInvoice i = new PaymentInvoice();
        OrderFixtures.set(i, "externalId", ext);
        return i;
    }

    @Test
    void oneFailingInvoiceDoesNotStopTheOthersNorTheAutoCancel() {
        PaymentInvoice bad = invoice("bad");
        PaymentInvoice good = invoice("good");
        PaymentInvoice pending = invoice("pending");
        byte[] overdue = UuidUtil.randomBytes();
        when(payments.isEnabled()).thenReturn(true);
        when(invoices.findOpenCreatedBefore(eq(PaymentInvoice.OPEN), any())).thenReturn(List.of(bad, good));
        when(invoices.findByRefundPendingUntilAfter(now)).thenReturn(List.of(pending));
        when(orders.overdueUnpaidIds(now)).thenReturn(List.of(overdue));
        doThrow(new IllegalStateException("poisoned row")).when(payments).refresh(bad);

        jobs.run();

        verify(payments).refresh(good);
        verify(payments).refresh(pending);
        verify(payments).refreshOrder(overdue);
    }
}
