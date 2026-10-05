package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.common.UserAgents;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.security.WebCookies;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * «Доверять этому устройству 30 дней».
 *
 * <p>The browser keeps a random 256-bit token in an {@code HttpOnly; SameSite=Strict} cookie scoped
 * to {@value #COOKIE_PATH} — page JavaScript (and so an XSS) can neither read it nor send it
 * anywhere else, which is why it is a cookie and not localStorage like the access token. The
 * server stores only its SHA-256 plus what the device looked like (for the account screen) and the
 * admin's {@code token_version} at the time: the token skips the code only for that admin, until it
 * expires, is revoked («Забыть все устройства», password change, 2FA reset) or the version moves
 * («Выйти на всех устройствах», «Заблокировать» in Telegram).
 */
@Slf4j
@Service
public class TrustedDeviceService {

    public static final String COOKIE = "admin_device";
    public static final String COOKIE_PATH = "/api/auth/admin";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final WebCookies webCookies;
    private final int days;

    public TrustedDeviceService(JdbcTemplate jdbc, WebCookies webCookies, AppProperties props) {
        this.jdbc = jdbc;
        this.webCookies = webCookies;
        this.days = Math.max(1, props.getSecurity().getAdminTrustedDeviceDays());
    }

    public int days() {
        return days;
    }

    /** Remembers the device; returns the raw token for the cookie. */
    public String issue(long adminId, int tokenVersion, ClientInfo client, String city) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        jdbc.update("INSERT INTO admin_trusted_devices (admin_id, token_hash, token_version, device_label, user_agent, "
                        + "ip, city, expires_at) VALUES (?,?,?,?,?,?,?,?)",
                adminId, hash(token), tokenVersion, UserAgents.osAndBrowser(client.userAgent()),
                client.userAgent(), client.ip(), city,
                Timestamp.from(Instant.now().plus(Duration.ofDays(days))));
        return token;
    }

    /** Does this cookie value vouch for this admin right now? Touches last_used_at when it does. */
    public boolean isTrusted(long adminId, int tokenVersion, String token) {
        if (token == null || token.isBlank() || token.length() > 100) {
            return false;
        }
        try {
            int updated = jdbc.update("UPDATE admin_trusted_devices SET last_used_at = ? WHERE token_hash = ? "
                            + "AND admin_id = ? AND token_version = ? AND revoked_at IS NULL AND expires_at > ?",
                    Timestamp.from(Instant.now()), hash(token), adminId, tokenVersion, Timestamp.from(Instant.now()));
            return updated == 1;
        } catch (Exception e) {
            log.warn("Trusted device check failed: {}", e.getMessage());
            return false;
        }
    }

    /** Devices that would currently skip the code. */
    public int countActive(long adminId, int tokenVersion) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM admin_trusted_devices WHERE admin_id = ? "
                        + "AND token_version = ? AND revoked_at IS NULL AND expires_at > ?",
                Integer.class, adminId, tokenVersion, Timestamp.from(Instant.now()));
        return n == null ? 0 : n;
    }

    /** «Забыть все устройства»; returns how many were still active. */
    public int revokeAll(long adminId) {
        return jdbc.update("UPDATE admin_trusted_devices SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL",
                Timestamp.from(Instant.now()), adminId);
    }

    public static String readCookie(HttpServletRequest request) {
        return WebCookies.read(request, COOKIE);
    }

    public void setCookie(HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(days)).toString());
    }

    public void clearCookie(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(webCookies.secure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }

    /** Expired / revoked rows are kept a month for the record, then dropped. */
    @Scheduled(cron = "0 45 4 * * *")
    public void cleanup() {
        try {
            Timestamp cutoff = Timestamp.from(Instant.now().minus(Duration.ofDays(30)));
            jdbc.update("DELETE FROM admin_trusted_devices WHERE expires_at < ? OR revoked_at < ?", cutoff, cutoff);
        } catch (Exception e) {
            log.warn("Trusted device cleanup failed: {}", e.getMessage());
        }
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
