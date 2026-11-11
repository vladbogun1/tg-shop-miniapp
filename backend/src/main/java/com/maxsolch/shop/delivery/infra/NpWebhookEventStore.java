package com.maxsolch.shop.delivery.infra;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * {@code np_webhook_events}: one row per webhook message id (V98), so NP's retry of a handled message is a no-op.
 * The claim is a plain INSERT: the primary key decides between two backends at once.
 */
@Repository
public class NpWebhookEventStore {

    private final JdbcTemplate jdbc;

    public NpWebhookEventStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** True = this call owns the message; false = it was handled (or is being handled) already. */
    public boolean claim(String eventId, String ttn) {
        try {
            jdbc.update("INSERT INTO np_webhook_events (event_id, ttn) VALUES (?, ?)", eventId,
                    ttn == null ? null : ttn.length() > 32 ? ttn.substring(0, 32) : ttn);
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    /** Applying failed: give NP's retry another chance. */
    public void release(String eventId) {
        jdbc.update("DELETE FROM np_webhook_events WHERE event_id = ?", eventId);
    }

    /** Claims older than {@code before} (retries come within minutes). */
    public int purgeBefore(Instant before) {
        return jdbc.update("DELETE FROM np_webhook_events WHERE received_at < ?", Timestamp.from(before));
    }
}
