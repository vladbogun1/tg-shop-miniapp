package com.maxsolch.shop.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.journal.ActivityLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

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
 * The webhook is public: the X-Sign signature is the only authentication. Characterisation of what answers
 * which code, what is written to the raw log and that nothing is applied without a good signature.
 */
class MonobankWebhookControllerTest {

    private static final byte[] BODY = "{\"invoiceId\":\"inv-1\",\"status\":\"success\",\"amount\":100,\"ccy\":980}"
            .getBytes(StandardCharsets.UTF_8);

    private MonobankSignatureVerifier verifier;
    private OnlinePaymentService payments;
    private JdbcTemplate jdbc;
    private ActivityLog activity;
    private ResponseEntityCaller call;

    /** The controller under test, built in one place so a change of wiring touches one line. */
    interface ResponseEntityCaller {
        ResponseEntity<Void> webhook(byte[] body, String xSign);
    }

    @BeforeEach
    void setUp() {
        verifier = mock(MonobankSignatureVerifier.class);
        payments = mock(OnlinePaymentService.class);
        jdbc = mock(JdbcTemplate.class);
        activity = mock(ActivityLog.class);
        when(payments.isEnabled()).thenReturn(true);
        MonobankWebhookController controller = new MonobankWebhookController(verifier, payments, new ObjectMapper(), jdbc);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "activity", activity);
        call = controller::webhook;
    }

    @Test
    void disabledPaymentOrEmptyBodyIs400AndNothingIsChecked() {
        when(payments.isEnabled()).thenReturn(false);
        assertThat(call.webhook(BODY, "sig").getStatusCode().value()).isEqualTo(400);
        when(payments.isEnabled()).thenReturn(true);
        assertThat(call.webhook(null, "sig").getStatusCode().value()).isEqualTo(400);
        assertThat(call.webhook(new byte[0], "sig").getStatusCode().value()).isEqualTo(400);
        verify(verifier, never()).verify(any(), any());
    }

    @Test
    void badSignatureIs401IsLoggedRawAndJournaledAndNotApplied() {
        when(verifier.verify(BODY, "forged")).thenReturn(false);

        assertThat(call.webhook(BODY, "forged").getStatusCode().value()).isEqualTo(401);

        verify(payments, never()).applyStatus(any());
        verify(jdbc).update(anyString(), eq("MONOBANK"), eq("inv-1"), eq("success"), eq(false), anyString(), any());
        verify(activity).record(any(ActivityLog.Entry.class));
    }

    @Test
    void goodSignatureAppliesTheParsedStatusAndAnswers200() {
        when(verifier.verify(BODY, "good")).thenReturn(true);

        assertThat(call.webhook(BODY, "good").getStatusCode().value()).isEqualTo(200);

        verify(payments).applyStatus(new MonobankInvoiceStatus("inv-1", "success", null, null, 100L, 980, null,
                null, null, null, null, null));
        verify(jdbc).update(anyString(), eq("MONOBANK"), eq("inv-1"), eq("success"), eq(true), anyString(), any());
    }

    @Test
    void goodSignatureWithUnreadableBodyIs400() {
        byte[] junk = "not json".getBytes(StandardCharsets.UTF_8);
        when(verifier.verify(junk, "good")).thenReturn(true);

        assertThat(call.webhook(junk, "good").getStatusCode().value()).isEqualTo(400);

        verify(payments, never()).applyStatus(any());
    }

    @Test
    void aBrokenRawLogDoesNotStopTheWebhook() {
        when(verifier.verify(BODY, "good")).thenReturn(true);
        when(jdbc.update(anyString(), org.mockito.ArgumentMatchers.<Object[]>any())).thenThrow(new RuntimeException("db down"));

        assertThat(call.webhook(BODY, "good").getStatusCode().value()).isEqualTo(200);

        verify(payments).applyStatus(any());
    }

    @Test
    void aFailureWhileApplyingPropagatesSoTheBankRetries() {
        when(verifier.verify(BODY, "good")).thenReturn(true);
        when(payments.applyStatus(any())).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> call.webhook(BODY, "good")).isInstanceOf(IllegalStateException.class);
    }

    private static <T> T eq(T value) {
        return org.mockito.ArgumentMatchers.eq(value);
    }
}
