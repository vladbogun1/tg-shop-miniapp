package com.maxsolch.shop.common;

import java.util.Locale;

/**
 * "Chrome, Windows" out of a User-Agent string — for the bot's login prompt and the site's list
 * of active sessions. Deliberately coarse: it only has to let a person recognise their own device.
 */
public final class UserAgents {

    private UserAgents() {
    }

    public static String describe(String ua) {
        if (ua == null || ua.isBlank()) {
            return "Unknown browser";
        }
        String s = ua.toLowerCase(Locale.ROOT);
        String browser = browser(s);
        String os = os(s);
        if (browser == null && os == null) {
            return ua.length() > 60 ? ua.substring(0, 60) + "…" : ua;
        }
        if (browser == null) {
            return os;
        }
        return os == null ? browser : browser + ", " + os;
    }

    private static String browser(String s) {
        // Order matters: most UAs also claim to be Chrome/Safari/Mozilla.
        if (s.contains("telegram")) {
            return "Telegram";
        }
        if (s.contains("edg/") || s.contains("edga/") || s.contains("edgios/")) {
            return "Edge";
        }
        if (s.contains("opr/") || s.contains("opera")) {
            return "Opera";
        }
        if (s.contains("yabrowser")) {
            return "Yandex Browser";
        }
        if (s.contains("samsungbrowser")) {
            return "Samsung Internet";
        }
        if (s.contains("firefox/") || s.contains("fxios/")) {
            return "Firefox";
        }
        if (s.contains("chrome/") || s.contains("crios/") || s.contains("chromium/")) {
            return "Chrome";
        }
        if (s.contains("safari/")) {
            return "Safari";
        }
        if (s.startsWith("curl/")) {
            return "curl";
        }
        return null;
    }

    private static String os(String s) {
        if (s.contains("iphone")) {
            return "iPhone";
        }
        if (s.contains("ipad")) {
            return "iPad";
        }
        if (s.contains("android")) {
            return "Android";
        }
        if (s.contains("windows")) {
            return "Windows";
        }
        if (s.contains("mac os x") || s.contains("macintosh")) {
            return "macOS";
        }
        if (s.contains("cros")) {
            return "ChromeOS";
        }
        if (s.contains("linux")) {
            return "Linux";
        }
        return null;
    }
}
