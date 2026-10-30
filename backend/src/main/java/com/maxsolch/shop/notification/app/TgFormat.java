package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.platform.config.AppProperties;

/** Small formatting and config helpers shared by the Telegram notification classes. */
public final class TgFormat {

    private TgFormat() {
    }

    /** A bot token is configured: there is a bot to send anything with. */
    public static boolean botConfigured(AppProperties props) {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    /** Telegram only accepts HTTPS URLs in inline buttons (and rejects localhost). */
    public static boolean isHttps(String url) {
        return url != null && url.startsWith("https://");
    }

    /**
     * Minor units → whole currency units, rounded the same way the frontends do
     * (lib/money.ts uses Math.round). Truncating here made a Telegram card and the app show
     * different totals for the same order whenever kopecks were involved.
     */
    public static String money(long minor) {
        return com.maxsolch.shop.platform.util.MoneyFormat.amount(minor);
    }

    public static String nz(String s) {
        return s == null ? "" : s;
    }

    public static String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
