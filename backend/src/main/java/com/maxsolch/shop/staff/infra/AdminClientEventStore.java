package com.maxsolch.shop.staff.infra;

import com.maxsolch.shop.staff.domain.AdminClientEvent;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** The {@code admin_client_events} table (V99): the admin panel's own telemetry. */
@Repository
public class AdminClientEventStore {

    private final JdbcTemplate jdbc;

    public AdminClientEventStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** How many events this admin stored since {@code since} — the rate limit (index admin_id, created_at). */
    public int countSince(long adminId, Instant since) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_client_events WHERE admin_id = ? AND created_at >= ?",
                Integer.class, adminId, Timestamp.from(since));
        return n == null ? 0 : n;
    }

    public void insertAll(List<AdminClientEvent> events) {
        if (events.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO admin_client_events (admin_id, kind, path, build, ua, standalone, meta, created_at) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                events.stream().map(e -> new Object[]{e.adminId(), e.kind(), e.path(), e.build(), e.ua(), e.standalone(),
                        e.metaJson(), Timestamp.from(e.createdAt())}).toList());
    }

    /** Newest first; {@code kind} / {@code adminId} narrow the list when given. */
    public List<AdminClientEvent> latest(int limit, String kind, Long adminId) {
        StringBuilder sql = new StringBuilder("SELECT id, admin_id, kind, path, build, ua, standalone, meta, created_at "
                + "FROM admin_client_events WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (kind != null) {
            sql.append(" AND kind = ?");
            args.add(kind);
        }
        if (adminId != null) {
            sql.append(" AND admin_id = ?");
            args.add(adminId);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ?");
        args.add(limit);
        return jdbc.query(sql.toString(), (rs, i) -> new AdminClientEvent(rs.getLong("id"), rs.getLong("admin_id"),
                rs.getString("kind"), rs.getString("path"), rs.getString("build"), rs.getString("ua"),
                rs.getBoolean("standalone"), rs.getString("meta"), rs.getTimestamp("created_at").toInstant()), args.toArray());
    }

    /** @return how many events older than {@code before} are gone */
    public int deleteOlderThan(Instant before) {
        return jdbc.update("DELETE FROM admin_client_events WHERE created_at < ?", Timestamp.from(before));
    }
}
