package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.tg.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReceiptDeliveryJobTest {

    static final Instant NOW = Instant.parse("2026-10-07T12:00:00Z");
    static final long TG = 777L;
    static final String PDF_B64 = Base64.getEncoder().encodeToString("%PDF-1.4".getBytes());

    @Mock
    MonobankClient mono;
    @Mock
    PaymentInvoiceRepository invoices;
    @Mock
    OrderRepository orders;
    @Mock
    UserRepository users;
    @Mock
    ReceiptDeliveryStore store;
    @Mock
    ReceiptService receipts;
    @Mock
    NotificationService notifications;
    @Mock
    SettingsService settings;

    ReceiptDeliveryJob job;
    Order order;
    PaymentInvoice inv;

    @BeforeEach
    void setUp() {
        job = new ReceiptDeliveryJob(mono, invoices, orders, users, store, receipts, notifications, settings);
        order = new Order();
        order.setId(UuidUtil.randomBytes());
        order.setTgUserId(TG);
        inv = new PaymentInvoice();
        inv.setId(UuidUtil.randomBytes());
        inv.setOrderId(order.getId());
        inv.setExternalId("inv-1");
        inv.setAmountMinor(100_000);
        inv.setStatus(PaymentInvoice.SUCCESS);
        inv.setAppliedAt(NOW.minus(Duration.ofMinutes(5)));

        lenient().when(mono.isEnabled()).thenReturn(true);
        lenient().when(notifications.isBotEnabled()).thenReturn(true);
        lenient().when(settings.getBool(SettingsRegistry.PAYMENT_SEND_RECEIPTS_TO_TELEGRAM)).thenReturn(true);
        lenient().when(invoices.findReceiptCandidates(any())).thenReturn(List.of(inv));
        lenient().when(orders.findById(order.getId())).thenReturn(Optional.of(order));
        lenient().when(users.findById(TG)).thenReturn(Optional.empty());
        lenient().when(store.handled(inv.getId())).thenReturn(Map.of());
        lenient().when(store.claim(anyString(), any(), any(), any(), any())).thenReturn(true);
        lenient().when(notifications.sendReceipt(any(), any(), any(), any())).thenReturn(NotificationService.Delivery.SENT);
    }

    private static MonobankClient.FiscalCheck check(String id, String type, String status) {
        return new MonobankClient.FiscalCheck(id, type, status, null, "https://cabinet.tax.gov.ua/cashregs/check",
                "done".equals(status) ? PDF_B64 : null, "checkbox");
    }

    @Test
    void doneSaleCheck_isSentOnce_andRecorded() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c-sale", "sale", "done")));

        job.deliver(NOW);

        verify(store).claim(eq("c-sale"), eq(inv.getId()), eq(order.getId()), eq(ReceiptKind.FISCAL_SALE), eq(NOW));
        verify(notifications).sendReceipt(eq(order), any(), eq(ReceiptKind.FISCAL_SALE),
                eq("https://cabinet.tax.gov.ua/cashregs/check"));
        verify(store).finish("c-sale", ReceiptDeliveryStore.SENT);
    }

    @Test
    void alreadyHandledCheck_isNotSentAgain() {
        inv.setRefundedMinor(50_000); // a refund is pending, so the invoice is still looked at
        when(store.handled(inv.getId())).thenReturn(Map.of("c-sale", ReceiptKind.FISCAL_SALE));
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(
                check("c-sale", "sale", "done"), check("c-ret", "return", "done")));

        job.deliver(NOW);

        verify(store, never()).claim(eq("c-sale"), any(), any(), any(), any());
        verify(notifications, times(1)).sendReceipt(any(), any(), eq(ReceiptKind.FISCAL_RETURN), any());
        verify(store).finish("c-ret", ReceiptDeliveryStore.SENT);
    }

    @Test
    void saleSentAndNoRefund_monobankIsNotEvenAsked() {
        when(store.handled(inv.getId())).thenReturn(Map.of("c-sale", ReceiptKind.FISCAL_SALE));

        job.deliver(NOW);

        verify(mono, never()).fiscalChecks(any());
        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
    }

    @Test
    void claimTakenByAnotherRun_noSend() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c-sale", "sale", "done")));
        when(store.claim(anyString(), any(), any(), any(), any())).thenReturn(false);

        job.deliver(NOW);

        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
    }

    @Test
    void transientSendFailure_releasesClaim_forTheNextRun() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c-sale", "sale", "done")));
        when(notifications.sendReceipt(any(), any(), any(), any())).thenReturn(NotificationService.Delivery.FAILED);

        job.deliver(NOW);

        verify(store).release("c-sale");
        verify(store, never()).finish(eq("c-sale"), any());
    }

    @Test
    void blockedBot_recordedAndUserMarked() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c-sale", "sale", "done")));
        when(notifications.sendReceipt(any(), any(), any(), any())).thenReturn(NotificationService.Delivery.BLOCKED);

        job.deliver(NOW);

        verify(store).finish("c-sale", ReceiptDeliveryStore.BLOCKED);
        verify(users).markBotBlocked(TG, NOW);
    }

    @Test
    void pendingOrFailedChecks_areNotSent() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(
                check("c-1", "sale", "process"), check("c-2", "sale", "failed")));

        job.deliver(NOW);

        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
        verify(store, never()).claim(anyString(), any(), any(), any(), any());
    }

    @Test
    void noFiscalChecks_after30Minutes_bankReceiptFallback() {
        inv.setAppliedAt(NOW.minus(Duration.ofMinutes(31)));
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of());
        when(mono.bankReceipt("inv-1")).thenReturn("%PDF-1.4".getBytes());

        job.deliver(NOW);

        String key = "bank:" + UuidUtil.toString(inv.getId());
        verify(store).claim(eq(key), any(), any(), eq(ReceiptKind.BANK), eq(NOW));
        verify(notifications).sendReceipt(eq(order), any(), eq(ReceiptKind.BANK), eq(null));
        verify(store).finish(key, ReceiptDeliveryStore.SENT);
    }

    @Test
    void noFiscalChecksYet_within30Minutes_waits() {
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of());

        job.deliver(NOW);

        verify(mono, never()).bankReceipt(any());
        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
    }

    @Test
    void monobankError_isNotTreatedAsNoChecks() {
        inv.setAppliedAt(NOW.minus(Duration.ofHours(2)));
        when(mono.fiscalChecks("inv-1")).thenThrow(new MonobankClient.MonobankException(500, "X", "boom"));

        job.deliver(NOW);

        verify(mono, never()).bankReceipt(any());
        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
    }

    @Test
    void bankFallbackAlreadySent_notRepeated() {
        inv.setAppliedAt(NOW.minus(Duration.ofHours(2)));
        when(store.handled(inv.getId())).thenReturn(Map.of("bank:x", ReceiptKind.BANK));

        job.deliver(NOW);

        verify(mono, never()).fiscalChecks(any());
        verify(mono, never()).bankReceipt(any());
    }

    @Test
    void noTelegramAccountOrBlocked_skipped() {
        order.setTgUserId(null);
        job.deliver(NOW);

        User blocked = new User();
        blocked.setBotBlocked(true);
        order.setTgUserId(TG);
        when(users.findById(TG)).thenReturn(Optional.of(blocked));
        job.deliver(NOW);

        verify(mono, never()).fiscalChecks(any());
        verify(notifications, never()).sendReceipt(any(), any(), any(), any());
    }

    @Test
    void settingOff_nothingHappens() {
        when(settings.getBool(SettingsRegistry.PAYMENT_SEND_RECEIPTS_TO_TELEGRAM)).thenReturn(false);

        job.deliver(NOW);

        verify(invoices, never()).findReceiptCandidates(any());
    }
}
