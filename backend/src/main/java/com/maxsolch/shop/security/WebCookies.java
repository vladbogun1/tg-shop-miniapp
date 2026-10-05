package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * The public site's auth cookies, in one place so every endpoint sets them identically.
 *
 * <table>
 *   <tr><th>Cookie</th><th>Path</th><th>Lifetime</th></tr>
 *   <tr><td>{@value #LOGIN_BIND}</td><td>{@value #AUTH_PATH}</td><td>login window (5 min)</td></tr>
 *   <tr><td>{@value #ACCESS}</td><td>/</td><td>15 min (CUSTOMER JWT, chn=web)</td></tr>
 *   <tr><td>{@value #REFRESH}</td><td>{@value #AUTH_PATH}</td><td>30 days (opaque, rotated)</td></tr>
 *   <tr><td>{@value #SESSION_HINT}</td><td>/</td><td>same as {@value #REFRESH}</td></tr>
 * </table>
 *
 * <p>{@value #SESSION_HINT} = "1" holds no secret: it only tells the site's JavaScript that this
 * browser has a session, so a guest does not probe {@code /api/me/**} and {@code /refresh} on every
 * page (two 401s in the console per visit). It is set and cleared together with the refresh cookie
 * and is NOT {@code HttpOnly} (the page has to read it).
 *
 * <p>All the others are {@code HttpOnly} + {@code SameSite=Lax}. {@code Secure} comes from
 * {@code WEB_COOKIE_SECURE}; unset means true, except under the {@code dev} profile where the site
 * runs on plain-http localhost and a Secure cookie would simply never be sent back.
 */
@Slf4j
@Component
public class WebCookies {

    public static final String LOGIN_BIND = "login_bind";
    public static final String ACCESS = "access";
    public static final String REFRESH = "refresh";
    public static final String SESSION_HINT = "signed_in";
    public static final String AUTH_PATH = "/api/auth/web";

    private final boolean secure;
    private final AppProperties.Site site;

    @Autowired
    public WebCookies(AppProperties props, Environment environment) {
        this.site = props.getSite();
        Boolean configured = site.getWebCookieSecure();
        this.secure = configured != null ? configured : !isDev(environment);
        log.info("Site auth cookies: Secure={}", secure);
    }

    /** For unit tests. */
    public WebCookies(AppProperties.Site site, boolean secure) {
        this.site = site;
        this.secure = secure;
    }

    public boolean secure() {
        return secure;
    }

    public void setLoginBind(HttpServletResponse response, String value) {
        add(response, build(LOGIN_BIND, value, AUTH_PATH, Duration.ofMinutes(site.getLoginMinutes())));
    }

    public void setAccess(HttpServletResponse response, String jwt) {
        add(response, build(ACCESS, jwt, "/", Duration.ofMinutes(site.getAccessMinutes())));
    }

    public void setRefresh(HttpServletResponse response, String token) {
        add(response, build(REFRESH, token, AUTH_PATH, Duration.ofDays(site.getSessionDays())));
        add(response, hint("1", Duration.ofDays(site.getSessionDays())));
    }

    public void clearLoginBind(HttpServletResponse response) {
        add(response, build(LOGIN_BIND, "", AUTH_PATH, Duration.ZERO));
    }

    public void clearSession(HttpServletResponse response) {
        add(response, build(ACCESS, "", "/", Duration.ZERO));
        add(response, build(REFRESH, "", AUTH_PATH, Duration.ZERO));
        add(response, hint("", Duration.ZERO));
    }

    /** Value of a cookie on the request, or null. */
    public static String read(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie c : cookies) {
            if (name.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
                return c.getValue();
            }
        }
        return null;
    }

    private ResponseCookie build(String name, String value, String path, Duration maxAge) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAge)
                .build();
    }

    /** The script-readable session flag (see the class comment). */
    private ResponseCookie hint(String value, Duration maxAge) {
        return ResponseCookie.from(SESSION_HINT, value)
                .httpOnly(false)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private static void add(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private static boolean isDev(Environment environment) {
        for (String profile : environment.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(profile) || "local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }
}
