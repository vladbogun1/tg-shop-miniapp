package com.maxsolch.shop.payment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * {@code payment_receipts_sent} (V46): which receipts the bot already sent to the customer.
 *
 * <p>Every statement auto-commits on its own — the Telegram call between {@link #claim} and
 * {@link #finish} must never sit inside a DB transaction. A receipt is claimed (INSERT IGNORE on
 * the primary key) before it is sent, so two runs can never both send it; a send that failed for
 * a transient reason {@link #release releases} the claim so the next run retries.
 */
@Component
public class ReceiptDeliveryStore {

    public static final String SENDING = "SENDING";
    public static final String SENT = "SENT";
    public static final String BLOCKED = "BLOCKED";

    private final JdbcTemplate jdbc;

    public ReceiptDeliveryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** check id → kind of everything already handled (sent, blocked or being sent) for the invoice. */
    public Map<String, ReceiptKind> handled(byte[] invoiceId) {
        Map<String, ReceiptKind> out = new HashMap<>();
        jdbc.query("select check_id, kind from payment_receipts_sent where invoice_id = ?",
                rs -> {
                    try {
                        out.put(rs.getString(1), ReceiptKind.valueOf(rs.getString(2)));
                    } catch (IllegalArgumentException ignored) {
                        // a kind from a newer version — still counts as handled
                        out.put(rs.getString(1), ReceiptKind.FISCAL_SALE);
                    }
                }, (Object) invoiceId);
        return out;
    }

    /** True when this call took the receipt; false when another run already has it. */
    public boolean claim(String checkId, byte[] invoiceId, byte[] orderId, ReceiptKind kind, Instant now) {
        return jdbc.update("insert ignore into payment_receipts_sent "
                        + "(check_id, invoice_id, order_id, kind, outcome, sent_at) values (?, ?, ?, ?, ?, ?)",
                checkId, invoiceId, orderId, kind.name(), SENDING, Timestamp.from(now)) == 1;
    }

    public void finish(String checkId, String outcome) {
        jdbc.update("update payment_receipts_sent set outcome = ? where check_id = ?", outcome, checkId);
    }

    /** The send failed for a transient reason: let the next run try again. */
    public void release(String checkId) {
        jdbc.update("delete from payment_receipts_sent where check_id = ? and outcome = ?", checkId, SENDING);
    }
}
