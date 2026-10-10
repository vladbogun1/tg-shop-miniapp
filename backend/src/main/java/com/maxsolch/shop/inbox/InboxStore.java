package com.maxsolch.shop.inbox;

import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.inbox.InboxFacts.ChatRow;
import com.maxsolch.shop.inbox.InboxFacts.OrderRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Plain-SQL access for the inbox: one query for candidate orders, one grouped query for unread
 * chats (with the preview of the newest unread message joined in), and the owner's marks. No
 * entities, no per-order lookups — the screen polls every 30 s.
 */
@Repository
public class InboxStore {

    private final JdbcTemplate jdbc;

    public InboxStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Orders that may produce a row. The WHERE only narrows the scan (the board's
     * {@code idx_orders_status_created} and the unread index serve it); {@link InboxRules}
     * re-checks every condition.
     */
    public List<OrderRow> candidateOrders(Instant newCutoff, Instant approvedCutoff, Instant returnsSince) {
        String sql = "select bin_to_uuid(o.id) id, o.status, o.customer_name, o.total_minor, o.received_minor, "
                + "o.prepayment_minor, o.refunded_minor, o.created_at, o.approved_at, o.shipped_at, o.rejected_at, "
                + "o.returned_at, o.paid, o.paid_at, o.reject_reason, o.reject_reason_code, "
                + "o.cancel_request_status, o.cancel_request_reason, o.cancel_requested_at, o.payment_due_at, "
                + "exists (select 1 from payment_invoices pi where pi.order_id = o.id "
                + "and pi.applied_at is not null) paid_online "
                + "from orders o "
                + "where (o.status = 'NEW' and o.paid = true) "
                + "or (o.cancel_request_status = 'PENDING' and o.status in ('NEW', 'APPROVED')) "
                + "or (o.status = 'REJECTED' and o.shipped_at is null and o.received_minor > o.refunded_minor) "
                + "or (o.status = 'NEW' and o.created_at <= ?) "
                + "or (o.status = 'APPROVED' and coalesce(o.approved_at, o.created_at) <= ?) "
                + "or (o.status = 'APPROVED' and o.payment_due_at is not null and o.received_minor < o.total_minor) "
                + "or (o.status = 'REJECTED' and o.shipped_at is not null and o.rejected_at >= ?) "
                + "or (o.returned_at >= ?) "
                + "or o.id in (select m.order_id from order_messages m "
                + "where m.sender_type = 'CUSTOMER' and m.read_at is null)";
        return jdbc.query(sql, (rs, i) -> new OrderRow(
                        rs.getString("id"),
                        OrderStatus.valueOf(rs.getString("status")),
                        rs.getString("customer_name"),
                        rs.getLong("total_minor"),
                        rs.getLong("received_minor"),
                        rs.getLong("prepayment_minor"),
                        rs.getLong("refunded_minor"),
                        ts(rs, "created_at"),
                        ts(rs, "approved_at"),
                        ts(rs, "shipped_at"),
                        ts(rs, "rejected_at"),
                        ts(rs, "returned_at"),
                        rs.getBoolean("paid"),
                        ts(rs, "paid_at"),
                        rs.getBoolean("paid_online"),
                        rs.getString("reject_reason"),
                        rs.getString("reject_reason_code"),
                        rs.getString("cancel_request_status"),
                        rs.getString("cancel_request_reason"),
                        ts(rs, "cancel_requested_at"),
                        ts(rs, "payment_due_at")),
                Timestamp.from(newCutoff), Timestamp.from(approvedCutoff),
                Timestamp.from(returnsSince), Timestamp.from(returnsSince));
    }

    /** One row per order with unread customer messages: count, newest id, oldest time, newest preview. */
    public List<ChatRow> unreadChats() {
        String sql = "select bin_to_uuid(u.order_id) order_id, u.cnt, u.last_id, u.first_at, "
                + "m.type, m.text, m.file_name "
                + "from (select order_id, count(*) cnt, max(id) last_id, min(created_at) first_at "
                + "      from order_messages where sender_type = 'CUSTOMER' and read_at is null "
                + "      group by order_id) u "
                + "join order_messages m on m.id = u.last_id";
        return jdbc.query(sql, (rs, i) -> new ChatRow(
                rs.getString("order_id"),
                rs.getLong("cnt"),
                rs.getLong("last_id"),
                ts(rs, "first_at"),
                preview(rs.getString("type"), rs.getString("text"), rs.getString("file_name"))));
    }

    /** All marks keyed by {@link InboxMark#key}. Rows of an unknown type (older code) are skipped. */
    public Map<String, InboxMark> marks() {
        Map<String, InboxMark> out = new HashMap<>();
        jdbc.query("select item_type, entity_id, item_version, mark, until_at from inbox_marks", rs -> {
            InboxItemType type = InboxItemType.parse(rs.getString("item_type"));
            InboxMark.Kind kind;
            try {
                kind = InboxMark.Kind.valueOf(rs.getString("mark"));
            } catch (IllegalArgumentException e) {
                return;
            }
            if (type == null) {
                return;
            }
            InboxMark m = new InboxMark(type, rs.getString("entity_id"), rs.getString("item_version"), kind,
                    ts(rs, "until_at"));
            out.put(InboxMark.key(type, m.entityId()), m);
        });
        return out;
    }

    /** Insert or replace the mark of one row (the latest action wins). */
    public void upsert(InboxMark mark, Long adminId, String adminName) {
        jdbc.update("insert into inbox_marks (item_type, entity_id, item_version, mark, until_at, created_at, "
                        + "created_by, created_by_name) values (?, ?, ?, ?, ?, ?, ?, ?) "
                        + "on duplicate key update item_version = values(item_version), mark = values(mark), "
                        + "until_at = values(until_at), created_at = values(created_at), "
                        + "created_by = values(created_by), created_by_name = values(created_by_name)",
                mark.type().name(), mark.entityId(), mark.version(), mark.kind().name(),
                mark.until() == null ? null : Timestamp.from(mark.until()), Timestamp.from(Instant.now()),
                adminId, adminName);
    }

    /** @return the mark that was removed, or null */
    public InboxMark delete(InboxItemType type, String entityId) {
        InboxMark existing = marks().get(InboxMark.key(type, entityId));
        jdbc.update("delete from inbox_marks where item_type = ? and entity_id = ?", type.name(), entityId);
        return existing;
    }

    /**
     * Housekeeping on every write: expired snoozes hide nothing, and old «Разобрано» marks point at
     * events that have long left the screen (returns live 14 days).
     */
    public void purge(Instant snoozedBefore, Instant dismissedBefore) {
        jdbc.update("delete from inbox_marks where (mark = 'SNOOZED' and until_at < ?) "
                        + "or (mark = 'DISMISSED' and created_at < ?)",
                Timestamp.from(snoozedBefore), Timestamp.from(dismissedBefore));
    }

    static String preview(String type, String text, String fileName) {
        String t = text == null ? "" : text.replaceAll("<[^>]+>", "").replace("&amp;", "&").replace("&lt;", "<")
                .replace("&gt;", ">").replaceAll("\\s+", " ").trim();
        if ("PHOTO".equals(type)) {
            return t.isEmpty() ? "📷 Фото" : "📷 " + t;
        }
        if ("FILE".equals(type)) {
            String name = fileName == null || fileName.isBlank() ? "Файл" : fileName.trim();
            return t.isEmpty() ? "📎 " + name : "📎 " + t;
        }
        return t;
    }

    private static Instant ts(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
