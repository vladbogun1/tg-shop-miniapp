package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.platform.security.WebCookies;
import com.maxsolch.shop.staff.app.TrustedDeviceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** The «trusted device» cookie of the admin login: the HTTP side of {@link TrustedDeviceService} (the scenarios see only the token). */
@Component
public class TrustedDeviceCookie {

    public static final String COOKIE = "admin_device";
    public static final String COOKIE_PATH = "/api/auth/admin";

    private final WebCookies webCookies;
    private final TrustedDeviceService devices;

    public TrustedDeviceCookie(WebCookies webCookies, TrustedDeviceService devices) {
        this.webCookies = webCookies;
        this.devices = devices;
    }

    public static String read(HttpServletRequest request) {
        return WebCookies.read(request, COOKIE);
    }

    public void set(HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(devices.days())).toString());
    }

    public void clear(HttpServletResponse response) {
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
}
