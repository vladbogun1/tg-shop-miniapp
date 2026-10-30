package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.payment.infra.WebhookLogStore;
import com.maxsolch.shop.journal.app.ActivityLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The webhook is public: the X-Sign signature is the only authentication. Characterisation of what outcome (the controller turns
 * it into 400/401/200), what is written to the raw log and that nothing is applied without a good signature.
 */
class MonobankWebhooksTest {

    private static final byte[] BODY = "{\"invoiceId\":\"inv-1\",\"status\":\"success\",\"amount\":100,\"ccy\":980}"
            .getBytes(StandardCharsets.UTF_8);

    private MonobankSignatureVerifier verifier;
    private OnlinePaymentService payments;
    private WebhookLogStore webhookLog;
    private ActivityLog activity;
    private MonobankWebhooks webhooks;

    @BeforeEach
    void setUp() {
        verifier = mock(MonobankSignatureVerifier.class);
        payments = mock(OnlinePaymentService.class);
        webhookLog = mock(WebhookLogStore.class);
        activity = mock(ActivityLog.class);
        when(payments.isEnabled()).thenReturn(true);
        webhooks = new MonobankWebhooks(verifier, payments, new ObjectMapper(), webhookLog, activity,
                java.time.Clock.systemUTC());
    }

    private MonobankWebhooks.Outcome handle(byte[] body, String xSign) {
        return webhooks.handle(body, xSign);
    }

    @Test
    void disabledPaymentOrEmptyBodyIs400AndNothingIsChecked() {
        when(payments.isEnabled()).thenReturn(false);
        assertThat(handle(BODY, "sig")).isEqualTo(MonobankWebhooks.Outcome.IGNORED);
        when(payments.isEnabled()).thenReturn(true);
        assertThat(handle(null, "sig")).isEqualTo(MonobankWebhooks.Outcome.IGNORED);
        assertThat(handle(new byte[0], "sig")).isEqualTo(MonobankWebhooks.Outcome.IGNORED);
        verify(verifier, never()).verify(any(), any());
    }

    @Test
    void badSignatureIs401IsLoggedRawAndJournaledAndNotApplied() {
        when(verifier.verify(BODY, "forged")).thenReturn(false);

        assertThat(handle(BODY, "forged")).isEqualTo(MonobankWebhooks.Outcome.BAD_SIGNATURE);

        verify(payments, never()).applyStatus(any());
        verify(webhookLog).append(eq("inv-1"), eq("success"), eq(false), anyString(), any());
        verify(activity).record(any(ActivityLog.Entry.class));
    }

    @Test
    void goodSignatureAppliesTheParsedStatusAndAnswers200() {
        when(verifier.verify(BODY, "good")).thenReturn(true);

        assertThat(handle(BODY, "good")).isEqualTo(MonobankWebhooks.Outcome.APPLIED);

        verify(payments).applyStatus(new MonobankInvoiceStatus("inv-1", "success", null, null, 100L, 980, null,
                null, null, null, null, null));
        verify(webhookLog).append(eq("inv-1"), eq("success"), eq(true), anyString(), any());
    }

    @Test
    void goodSignatureWithUnreadableBodyIs400() {
        byte[] junk = "not json".getBytes(StandardCharsets.UTF_8);
        when(verifier.verify(junk, "good")).thenReturn(true);

        assertThat(handle(junk, "good")).isEqualTo(MonobankWebhooks.Outcome.UNREADABLE);

        verify(payments, never()).applyStatus(any());
    }

    @Test
    void aBrokenRawLogDoesNotStopTheWebhook() {
        when(verifier.verify(BODY, "good")).thenReturn(true);
        org.mockito.Mockito.doThrow(new RuntimeException("db down")).when(webhookLog).append(any(), any(), org.mockito.ArgumentMatchers.anyBoolean(), anyString(), any());

        assertThat(handle(BODY, "good")).isEqualTo(MonobankWebhooks.Outcome.APPLIED);

        verify(payments).applyStatus(any());
    }

    @Test
    void aFailureWhileApplyingPropagatesSoTheBankRetries() {
        when(verifier.verify(BODY, "good")).thenReturn(true);
        when(payments.applyStatus(any())).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> handle(BODY, "good")).isInstanceOf(IllegalStateException.class);
    }

    private static <T> T eq(T value) {
        return org.mockito.ArgumentMatchers.eq(value);
    }
}
