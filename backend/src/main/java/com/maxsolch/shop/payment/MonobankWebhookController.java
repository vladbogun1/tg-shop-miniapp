package com.maxsolch.shop.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;

/**
 * monobank posts invoice status changes here (up to 3 attempts until it gets 200). Public — the
 * {@code X-Sign} ECDSA signature over the raw body is the authentication. Every call is logged raw.
 */
@Slf4j
@RestController
@Tag(name = "Payments", description = "monobank acquiring webhook")
public class MonobankWebhookController {

    private final MonobankSignatureVerifier verifier;
    private final OnlinePaymentService payments;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;

    public MonobankWebhookController(MonobankSignatureVerifier verifier, OnlinePaymentService payments,
                                     ObjectMapper mapper, JdbcTemplate jdbc) {
        this.verifier = verifier;
        this.payments = payments;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @PostMapping("/api/payments/mono/webhook")
    @Operation(summary = "monobank invoice status webhook (signed with X-Sign)")
    public ResponseEntity<Void> webhook(@RequestBody(required = false) byte[] body,
                                        @RequestHeader(value = "X-Sign", required = false) String xSign) {
        if (!payments.isEnabled() || body == null || body.length == 0) {
            return ResponseEntity.badRequest().build();
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
            log.warn("monobank webhook with a bad signature rejected (invoice {})", st == null ? "?" : st.invoiceId());
            return ResponseEntity.status(401).build();
        }
        if (st == null) {
            return ResponseEntity.badRequest().build();
        }
        // An exception here answers 500 and monobank retries; the poll job is the safety net.
        payments.applyStatus(st);
        return ResponseEntity.ok().build();
    }

    private void logRaw(MonobankInvoiceStatus st, boolean ok, byte[] body) {
        try {
            String text = new String(body, StandardCharsets.UTF_8);
            jdbc.update("insert into payment_webhook_log (provider, external_id, status, signature_ok, body, received_at) "
                            + "values (?, ?, ?, ?, ?, ?)",
                    PaymentInvoice.PROVIDER_MONOBANK,
                    st == null ? null : cut(st.invoiceId(), 64),
                    st == null ? null : cut(st.status(), 16),
                    ok,
                    text.length() > 60_000 ? text.substring(0, 60_000) : text,
                    Timestamp.from(Instant.now()));
        } catch (Exception e) {
            log.warn("monobank webhook log failed: {}", e.getMessage());
        }
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() <= max ? s : s.substring(0, max);
    }
}
