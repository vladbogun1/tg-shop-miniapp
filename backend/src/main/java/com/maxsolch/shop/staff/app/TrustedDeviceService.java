package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.platform.web.UserAgents;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.security.WebCookies;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import com.maxsolch.shop.staff.infra.TrustedDeviceStore;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Clock;
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

    private final TrustedDeviceStore store;
    private final Clock clock;
    private final WebCookies webCookies;
    private final int days;

    public TrustedDeviceService(TrustedDeviceStore store, WebCookies webCookies, AppProperties props, Clock clock) {
        this.store = store;
        this.clock = clock;
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
        store.insert(adminId, hash(token), tokenVersion, UserAgents.osAndBrowser(client.userAgent()),
                client.userAgent(), client.ip(), city, clock.instant().plus(Duration.ofDays(days)));
        return token;
    }

    /** Does this cookie value vouch for this admin right now? Touches last_used_at when it does. */
    public boolean isTrusted(long adminId, int tokenVersion, String token) {
        if (token == null || token.isBlank() || token.length() > 100) {
            return false;
        }
        try {
            int updated = store.touchIfValid(adminId, tokenVersion, hash(token), clock.instant());
            return updated == 1;
        } catch (Exception e) {
            log.warn("Trusted device check failed: {}", e.getMessage());
            return false;
        }
    }

    /** Devices that would currently skip the code. */
    public int countActive(long adminId, int tokenVersion) {
        return store.countActive(adminId, tokenVersion, clock.instant());
    }

    /** «Забыть все устройства»; returns how many were still active. */
    public int revokeAll(long adminId) {
        return store.revokeAll(adminId, clock.instant());
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

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
