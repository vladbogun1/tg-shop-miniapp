package com.maxsolch.shop.payment.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.payment.infra.WebhookLogStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;

import static com.maxsolch.shop.platform.util.Texts.cut;

/**
 * What happens to a monobank webhook (up to 3 attempts until monobank gets 200). The {@code X-Sign} ECDSA signature
 * over the raw body is the authentication; a signed call is logged raw; an unsigned one is only a log line (no database write).
 */
@Slf4j
@Service
public class MonobankWebhooks {

    /** How the controller answers. */
    public enum Outcome {
        /** Online payment is off, or the body is empty or oversized: 400. */
        IGNORED,
        /** The signature does not hold: 401. */
        BAD_SIGNATURE,
        /** Signed, but the body is not a monobank status: 400. */
        UNREADABLE,
        /** Applied (or an invoice we do not know): 200. */
        APPLIED
    }

    /** A real status is well under 2 KB; anything bigger is not from monobank. */
    static final int MAX_BODY = 64 * 1024;

    private final MonobankSignatureVerifier verifier;
    private final OnlinePaymentService payments;
    private final ObjectMapper mapper;
    private final WebhookLogStore webhookLog;
    private final Clock clock;

    public MonobankWebhooks(MonobankSignatureVerifier verifier, OnlinePaymentService payments, ObjectMapper mapper,
                            WebhookLogStore webhookLog, Clock clock) {
        this.verifier = verifier;
        this.payments = payments;
        this.mapper = mapper;
        this.webhookLog = webhookLog;
        this.clock = clock;
    }

    /** An exception from applying the status propagates (answers 500, monobank retries; the poll job is the net). */
    public Outcome handle(byte[] body, String xSign) {
        if (!payments.isEnabled() || body == null || body.length == 0 || body.length > MAX_BODY) {
            return Outcome.IGNORED;
        }
        // Signature first: an unsigned call must not cost a database write (the log and the journal
        // are fed by anyone who can reach the URL otherwise); it only gets a short log line.
        if (!verifier.verify(body, xSign)) {
            log.warn("monobank webhook with a bad signature rejected ({} bytes)", body.length);
            return Outcome.BAD_SIGNATURE;
        }
        MonobankInvoiceStatus st = null;
        try {
            st = mapper.readValue(body, MonobankInvoiceStatus.class);
        } catch (Exception e) {
            log.warn("monobank webhook: unreadable body ({})", e.getMessage());
        }
        logRaw(st, body);
        if (st == null) {
            return Outcome.UNREADABLE;
        }
        payments.applyStatus(st);
        return Outcome.APPLIED;
    }

    private void logRaw(MonobankInvoiceStatus st, byte[] body) {
        try {
            webhookLog.append(st == null ? null : cut(st.invoiceId(), 64), st == null ? null : cut(st.status(), 16), true,
                    new String(body, StandardCharsets.UTF_8), clock.instant());
        } catch (Exception e) {
            log.warn("monobank webhook log failed: {}", e.getMessage());
        }
    }
}
