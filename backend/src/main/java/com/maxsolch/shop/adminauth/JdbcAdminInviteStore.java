package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.domain.AdminRole;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** Plain-SQL {@link AdminInviteStore} over {@code admin_invites} (V38). */
@Repository
public class JdbcAdminInviteStore implements AdminInviteStore {

    private static final String COLUMNS = "id, token_hash, kind, telegram_user_id, name, role, invited_by, created_at, "
            + "expires_at, used_at, revoked_at, delivered, pending_username, pending_password_hash, pending_totp_enc, "
            + "pending_at, failed_attempts";

    private static final RowMapper<AdminInvite> MAPPER = JdbcAdminInviteStore::map;

    private final JdbcTemplate jdbc;

    public JdbcAdminInviteStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long insert(AdminInvite.Draft d) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("INSERT INTO admin_invites (token_hash, kind, telegram_user_id, "
                    + "name, role, invited_by, expires_at) VALUES (?,?,?,?,?,?,?)", Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, d.tokenHash());
            ps.setString(2, d.kind().name());
            ps.setLong(3, d.telegramUserId());
            ps.setString(4, d.name());
            ps.setString(5, d.role().name());
            ps.setLong(6, d.invitedBy());
            ps.setTimestamp(7, Timestamp.from(d.expiresAt()));
            return ps;
        }, keys);
        Number key = keys.getKey();
        if (key == null) {
            throw new IllegalStateException("no id for the new invite");
        }
        return key.longValue();
    }

    @Override
    public Optional<AdminInvite> byHash(String tokenHash) {
        return jdbc.query("SELECT " + COLUMNS + " FROM admin_invites WHERE token_hash = ?", MAPPER, tokenHash)
                .stream().findFirst();
    }

    @Override
    public Optional<AdminInvite> byId(long id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM admin_invites WHERE id = ?", MAPPER, id).stream().findFirst();
    }

    @Override
    public List<AdminInvite> live(Instant now) {
        return jdbc.query("SELECT " + COLUMNS + " FROM admin_invites WHERE used_at IS NULL AND revoked_at IS NULL "
                + "AND expires_at > ? ORDER BY created_at DESC, id DESC", MAPPER, Timestamp.from(now));
    }

    @Override
    public int revokeOpenFor(long telegramUserId, Instant now) {
        return jdbc.update("UPDATE admin_invites SET revoked_at = ?, pending_password_hash = NULL, pending_totp_enc = NULL "
                + "WHERE telegram_user_id = ? AND used_at IS NULL AND revoked_at IS NULL", Timestamp.from(now), telegramUserId);
    }

    @Override
    public boolean revoke(long id, Instant now) {
        return jdbc.update("UPDATE admin_invites SET revoked_at = ?, pending_password_hash = NULL, pending_totp_enc = NULL "
                + "WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL", Timestamp.from(now), id) == 1;
    }

    @Override
    public void markDelivered(long id, boolean delivered) {
        jdbc.update("UPDATE admin_invites SET delivered = ? WHERE id = ?", delivered, id);
    }

    @Override
    public void savePending(long id, String username, String passwordHash, String totpEnc, Instant at) {
        jdbc.update("UPDATE admin_invites SET pending_username = ?, pending_password_hash = ?, pending_totp_enc = ?, "
                + "pending_at = ? WHERE id = ?", username, passwordHash, totpEnc, Timestamp.from(at), id);
    }

    @Override
    public int incrementFailures(long id) {
        jdbc.update("UPDATE admin_invites SET failed_attempts = failed_attempts + 1 WHERE id = ?", id);
        Integer n = jdbc.queryForObject("SELECT failed_attempts FROM admin_invites WHERE id = ?", Integer.class, id);
        return n == null ? 0 : n;
    }

    @Override
    public boolean claim(long id, Instant now) {
        return jdbc.update("UPDATE admin_invites SET used_at = ?, pending_password_hash = NULL, pending_totp_enc = NULL "
                        + "WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
                Timestamp.from(now), id, Timestamp.from(now)) == 1;
    }

    @Override
    public boolean usernamePending(String username, long exceptInviteId, Instant now) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_invites WHERE LOWER(pending_username) = ? "
                        + "AND id <> ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
                Integer.class, username.toLowerCase(Locale.ROOT), exceptInviteId, Timestamp.from(now));
        return n != null && n > 0;
    }

    @Override
    public int purge(Instant before) {
        return jdbc.update("DELETE FROM admin_invites WHERE created_at < ? AND (used_at IS NOT NULL "
                + "OR revoked_at IS NOT NULL OR expires_at < ?)", Timestamp.from(before), Timestamp.from(before));
    }

    private static AdminInvite map(ResultSet rs, int i) throws SQLException {
        return new AdminInvite(rs.getLong("id"), rs.getString("token_hash"),
                AdminInvite.Kind.valueOf(rs.getString("kind")), rs.getLong("telegram_user_id"), rs.getString("name"),
                AdminRole.valueOf(rs.getString("role")), rs.getLong("invited_by"), ts(rs, "created_at"),
                ts(rs, "expires_at"), ts(rs, "used_at"), ts(rs, "revoked_at"), rs.getBoolean("delivered"),
                rs.getString("pending_username"), rs.getString("pending_password_hash"),
                rs.getString("pending_totp_enc"), ts(rs, "pending_at"), rs.getInt("failed_attempts"));
    }

    private static Instant ts(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
