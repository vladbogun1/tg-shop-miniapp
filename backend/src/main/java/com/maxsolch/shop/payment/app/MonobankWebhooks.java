package com.maxsolch.shop.payment.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.payment.infra.WebhookLogStore;
import com.maxsolch.shop.journal.app.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;

import static com.maxsolch.shop.platform.util.Texts.cut;

/**
 * What happens to a monobank webhook (up to 3 attempts until monobank gets 200). The {@code X-Sign} ECDSA signature
 * over the raw body is the authentication; every call is logged raw, whatever its outcome.
 */
@Slf4j
@Service
public class MonobankWebhooks {

    /** How the controller answers. */
    public enum Outcome {
        /** Online payment is off, or the body is empty: 400. */
        IGNORED,
        /** The signature does not hold: 401 (and a journal entry). */
        BAD_SIGNATURE,
        /** Signed, but the body is not a monobank status: 400. */
        UNREADABLE,
        /** Applied (or an invoice we do not know): 200. */
        APPLIED
    }

    private final MonobankSignatureVerifier verifier;
    private final OnlinePaymentService payments;
    private final ObjectMapper mapper;
    private final WebhookLogStore webhookLog;
    private final ActivityLog activity;
    private final Clock clock;

    public MonobankWebhooks(MonobankSignatureVerifier verifier, OnlinePaymentService payments, ObjectMapper mapper,
                            WebhookLogStore webhookLog, ActivityLog activity, Clock clock) {
        this.verifier = verifier;
        this.payments = payments;
        this.mapper = mapper;
        this.webhookLog = webhookLog;
        this.activity = activity;
        this.clock = clock;
    }

    /** An exception from applying the status propagates (answers 500, monobank retries; the poll job is the net). */
    public Outcome handle(byte[] body, String xSign) {
        if (!payments.isEnabled() || body == null || body.length == 0) {
            return Outcome.IGNORED;
        }
        boolean ok = verifier.verify(body, xSign);
        MonobankInvoiceStatus st = null;
        try {
            st = mapper.readValue(body, MonobankInvoiceStatus.class);
        } catch (Exception e) {
            log.warn("monobank webhook: unreadable body ({})", e.getMessage());
        }
        logRaw(st, ok, body);
        if (!ok) {
            log.warn("monobank webhook with a bad signature rejected (invoice {})",
                    st == null ? "?" : st.invoiceId());
            activity.record(ActivityLog.Entry.of(ActivityLog.PAYMENT, "WEBHOOK_REJECTED")
                    .text("Вебхук monobank с неверной подписью отклонён")
                    .detail("invoice", st == null ? null : st.invoiceId())
                    .detail("status", st == null ? null : st.status())
                    .failed("BAD_SIGNATURE", "X-Sign не прошёл проверку"));
            return Outcome.BAD_SIGNATURE;
        }
        if (st == null) {
            return Outcome.UNREADABLE;
        }
        payments.applyStatus(st);
        return Outcome.APPLIED;
    }

    private void logRaw(MonobankInvoiceStatus st, boolean ok, byte[] body) {
        try {
            webhookLog.append(st == null ? null : cut(st.invoiceId(), 64), st == null ? null : cut(st.status(), 16), ok,
                    new String(body, StandardCharsets.UTF_8), clock.instant());
        } catch (Exception e) {
            log.warn("monobank webhook log failed: {}", e.getMessage());
        }
    }
}
