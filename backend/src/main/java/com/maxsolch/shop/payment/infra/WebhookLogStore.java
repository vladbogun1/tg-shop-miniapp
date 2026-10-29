package com.maxsolch.shop.payment.infra;

import com.maxsolch.shop.payment.domain.PaymentInvoice;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** {@code payment_webhook_log}: every monobank webhook as it came in (raw body, whether the signature held). */
@Component
public class WebhookLogStore {

    private static final int MAX_BODY = 60_000;

    private final JdbcTemplate jdbc;

    public WebhookLogStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The newest log row: when it arrived and whether its signature was valid. */
    public record LastWebhook(Instant receivedAt, Boolean signatureOk) {
    }

    /** Adds a row; the body is cut to what the column holds. */
    public void append(String externalId, String status, boolean signatureOk, String body, Instant receivedAt) {
        jdbc.update("insert into payment_webhook_log (provider, external_id, status, signature_ok, body, received_at) "
                        + "values (?, ?, ?, ?, ?, ?)",
                PaymentInvoice.PROVIDER_MONOBANK,
                externalId,
                status,
                signatureOk,
                body.length() > MAX_BODY ? body.substring(0, MAX_BODY) : body,
                Timestamp.from(receivedAt));
    }

    public Optional<LastWebhook> last() {
        List<LastWebhook> last = jdbc.query(
                "select received_at, signature_ok from payment_webhook_log order by id desc limit 1",
                (rs, i) -> {
                    Timestamp at = rs.getTimestamp("received_at");
                    Object ok = rs.getObject("signature_ok");
                    return new LastWebhook(at == null ? null : at.toInstant(),
                            ok instanceof Boolean b ? b : ok instanceof Number n ? n.intValue() != 0 : null);
                });
        return last.stream().findFirst();
    }
}
