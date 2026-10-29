package com.maxsolch.shop.tg;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;

/** Small formatting and config helpers shared by the Telegram notification classes. */
final class TgFormat {

    private TgFormat() {
    }

    /** A bot token is configured: there is a bot to send anything with. */
    static boolean botConfigured(AppProperties props) {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    /** Telegram only accepts HTTPS URLs in inline buttons (and rejects localhost). */
    static boolean isHttps(String url) {
        return url != null && url.startsWith("https://");
    }

    /**
     * Minor units → whole currency units, rounded the same way the frontends do
     * (lib/money.ts uses Math.round). Truncating here made a Telegram card and the app show
     * different totals for the same order whenever kopecks were involved.
     */
    static String money(long minor) {
        return com.maxsolch.shop.common.MoneyFormat.amount(minor);
    }

    static String nz(String s) {
        return s == null ? "" : s;
    }

    static String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    static String idStr(Order order) {
        return UuidUtil.toString(order.getId());
    }

    static String shortId(Order order) {
        String id = idStr(order);
        return id == null ? "?" : id.substring(0, 8);
    }
}
