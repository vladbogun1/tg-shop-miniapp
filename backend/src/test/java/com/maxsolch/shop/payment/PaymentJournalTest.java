package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

/** monobank states land in «Журнал → Бот и сайт» once per change, not once per webhook / poll. */
class PaymentJournalTest {

    private static final String INVOICE = "p2_journal";

    private PaymentInvoice inv;
    private ActivityLog activity;
    private PaymentStatusApplier applier;

    @BeforeEach
    void setUp() {
        PaymentInvoiceRepository invoices = mock(PaymentInvoiceRepository.class);
        applier = new PaymentStatusApplier(invoices, mock(OrderService.class));
        activity = mock(ActivityLog.class);
        applier.setActivity(activity);
        inv = new PaymentInvoice();
        inv.setId(UuidUtil.randomBytes());
        inv.setOrderId(UuidUtil.randomBytes());
        inv.setExternalId(INVOICE);
        inv.setAmountMinor(4200);
        inv.setExpiresAt(Instant.parse("2026-10-05T11:00:00Z"));
        when(invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, INVOICE)).thenReturn(Optional.of(inv));
    }

    private static MonobankInvoiceStatus status(String status, String reason, String errCode, Long finalAmount,
                                                String modified) {
        return new MonobankInvoiceStatus(INVOICE, status, reason, errCode, 4200L, 980, finalAmount,
                "2026-10-05T10:00:00Z", modified, "order-ref", null, null);
    }

    @Test
    void successIsJournaledOnceEvenIfTheWebhookRepeats() {
        applier.apply(status(PaymentInvoice.SUCCESS, null, null, 4200L, "2026-10-05T10:00:05Z"));
        applier.apply(status(PaymentInvoice.SUCCESS, null, null, 4200L, "2026-10-05T10:00:05Z"));

        List<ActivityLog.Entry> all = recorded(1);
        assertThat(all.get(0).type()).isEqualTo("PAYMENT_SUCCESS");
        assertThat(all.get(0).source()).isEqualTo("PAYMENT");
        assertThat(all.get(0).resultCode()).isEqualTo("OK");
        assertThat(all.get(0).details()).containsEntry("invoice", INVOICE).containsEntry("amountMinor", 4200L);
    }

    @Test
    void declinedCardIsAFailureWithTheBankCode() {
        applier.apply(status(PaymentInvoice.FAILURE, "Недостатньо коштів", "59", null, "2026-10-05T10:00:05Z"));
        applier.apply(status(PaymentInvoice.FAILURE, "Недостатньо коштів", "59", null, "2026-10-05T10:00:06Z"));

        ActivityLog.Entry e = recorded(1).get(0);
        assertThat(e.type()).isEqualTo("PAYMENT_FAILURE");
        assertThat(e.resultCode()).isEqualTo("FAILED");
        assertThat(e.errorCode()).isEqualTo("MONO_59");
        assertThat(e.summary()).contains("Недостатньо коштів");
    }

    @Test
    void refundIsJournaledWithItsAmount() {
        applier.apply(status(PaymentInvoice.SUCCESS, null, null, 4200L, "2026-10-05T10:00:05Z"));
        applier.apply(status(PaymentInvoice.REVERSED, null, null, 1200L, "2026-10-05T12:00:00Z"));

        List<ActivityLog.Entry> all = recorded(2);
        assertThat(all.get(1).type()).isEqualTo("REFUND");
        assertThat(all.get(1).details()).containsEntry("refundMinor", 3000L);
    }

    @Test
    void withoutTheJournalNothingBreaks() {
        PaymentInvoiceRepository invoices = mock(PaymentInvoiceRepository.class);
        when(invoices.findForUpdate(PaymentInvoice.PROVIDER_MONOBANK, INVOICE)).thenReturn(Optional.of(inv));
        PaymentStatusApplier bare = new PaymentStatusApplier(invoices, mock(OrderService.class));
        assertThat(bare.apply(status(PaymentInvoice.SUCCESS, null, null, 4200L, "2026-10-05T10:00:05Z"))).isTrue();
        verify(activity, never()).recordAfterCommit(any());
    }

    private List<ActivityLog.Entry> recorded(int times) {
        ArgumentCaptor<ActivityLog.Entry> c = ArgumentCaptor.forClass(ActivityLog.Entry.class);
        verify(activity, times(times)).recordAfterCommit(c.capture());
        return c.getAllValues();
    }
}
