package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentError;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.payment.infra.WebhookLogStore;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** What the admin payment endpoints do before and after the money moves: 404 for a bad id, an audit line on a refund. */
class AdminPaymentsTest {

    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    private OnlinePaymentService payments;
    private PaymentInvoiceRepository invoices;
    private MonobankGateway monobank;
    private WebhookLogStore webhookLog;
    private AdminAuditService audit;
    private AdminPayments admin;
    private final String orderId = UuidUtil.toString(UuidUtil.randomBytes());

    @BeforeEach
    void setUp() {
        payments = mock(OnlinePaymentService.class);
        invoices = mock(PaymentInvoiceRepository.class);
        monobank = mock(MonobankGateway.class);
        webhookLog = mock(WebhookLogStore.class);
        audit = mock(AdminAuditService.class);
        admin = new AdminPayments(payments, invoices, monobank, mock(ReceiptService.class), webhookLog, audit,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void aMalformedOrderIdIsA404WithTheOldText() {
        assertThatThrownBy(() -> admin.invoices("nope"))
                .isInstanceOf(DomainException.NotFound.class)
                .hasMessage("заказ не найден");
        verify(payments, never()).refund(org.mockito.ArgumentMatchers.any(), anyString(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void aRefundIsAuditedAfterTheBankCall() {
        admin.refund(orderId, "inv-1", 5000L);

        verify(payments).refund(UuidUtil.toBytes(orderId), "inv-1", 5000L);
        verify(audit).record(eq("ORDER_REFUND_ONLINE"), eq("ORDER"), eq(orderId), eq("счёт inv-1, " + com.maxsolch.shop.platform.util.MoneyFormat.uah(5000)));
    }

    @Test
    void aFullRefundIsAuditedAsFull() {
        admin.refund(orderId, "inv-1", null);

        verify(audit).record(eq("ORDER_REFUND_ONLINE"), eq("ORDER"), eq(orderId), eq("счёт inv-1, полностью"));
    }

    @Test
    void aRefundThatTheBankRefusesIsNotAudited() {
        org.mockito.Mockito.doThrow(new DomainException.BadRequest(PaymentError.MONO_REFUND_REJECTED) {
            @Override
            public String getMessage() {
                return "monobank отклонил возврат";
            }
        })
                .when(payments).refund(org.mockito.ArgumentMatchers.any(), anyString(), org.mockito.ArgumentMatchers.any());

        assertThatThrownBy(() -> admin.refund(orderId, "inv-1", null)).isInstanceOf(DomainException.BadRequest.class);

        verify(audit, never()).record(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void refundPendingIsJudgedByTheClock() {
        PaymentInvoice pending = new PaymentInvoice();
        OrderFixtures.set(pending, "externalId", "a");
        OrderFixtures.set(pending, "refundPendingUntil", NOW.plusSeconds(60));
        PaymentInvoice done = new PaymentInvoice();
        OrderFixtures.set(done, "externalId", "b");
        OrderFixtures.set(done, "refundPendingUntil", NOW.minusSeconds(60));
        when(invoices.findByOrderIdOrderByCreatedAtDesc(UuidUtil.toBytes(orderId))).thenReturn(List.of(pending, done));

        assertThat(admin.invoices(orderId)).extracting(AdminInvoiceDto::refundPending).containsExactly(true, false);
    }

    @Test
    void theStatusCardShowsTheBanksNameAndTheLastWebhook() {
        when(monobank.isEnabled()).thenReturn(true);
        when(monobank.details()).thenReturn(new MonobankGateway.MerchantDetails("m", "ChiSetup", "123"));
        when(webhookLog.last()).thenReturn(Optional.of(new WebhookLogStore.LastWebhook(NOW, true)));

        AdminPayments.MonobankStatusDto status = admin.monobankStatus();

        assertThat(status).isEqualTo(new AdminPayments.MonobankStatusDto(true, "ChiSetup", null, NOW, true));
    }

    @Test
    void anUnreachableBankIsShownAsAnErrorNotAFailure() {
        when(monobank.isEnabled()).thenReturn(true);
        when(monobank.details()).thenThrow(new MonobankGateway.MonobankException(0, "IO", "down"));
        when(webhookLog.last()).thenReturn(Optional.empty());

        AdminPayments.MonobankStatusDto status = admin.monobankStatus();

        assertThat(status.error()).contains("down");
        assertThat(status.lastWebhookAt()).isNull();
    }
}
