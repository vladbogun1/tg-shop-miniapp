package com.maxsolch.shop.common;

/**
 * Money for Telegram texts, matching the apps (shared/src/money.ts): whole hryvnias without
 * decimals ("1 030"), and the exact kopecks whenever there are any ("0,95", "1 234,50") — rounding
 * 95 kopecks to "1" misled customers about what they pay.
 */
public final class MoneyFormat {

    private MoneyFormat() {
    }

    /** Amount without the currency sign, thin-space thousands, comma decimals. */
    public static String amount(long minor) {
        boolean negative = minor < 0;
        long abs = Math.abs(minor);
        String whole = String.format(java.util.Locale.ROOT, "%,d", abs / 100).replace(',', ' ');
        long kop = abs % 100;
        String text = kop == 0 ? whole : whole + "," + (kop < 10 ? "0" : "") + kop;
        return negative ? "-" + text : text;
    }

    /** {@link #amount} followed by " ₴". */
    public static String uah(long minor) {
        return amount(minor) + " ₴";
    }
}
