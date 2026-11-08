package com.maxsolch.shop.procurement.domain.supplyai;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Text normalization for supply lines: the supplier-memory key and the search words, plus JS-compatible
 * whitespace helpers shared by the rest of the package. Same logic as
 * frontend-admin/features/supply/model/ai/normalize.ts.
 */
public final class SupplyText {

    /** JS {@code \s}: Java's {@code \s} does not cover NBSP, BOM and the Unicode spaces. */
    static final String WS = "\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";

    private static final Pattern WS_RUN = Pattern.compile("[" + WS + "]+");
    private static final Pattern WS_EDGE = Pattern.compile("^[" + WS + "]+|[" + WS + "]+\\z");
    private static final Pattern NON_WORD = Pattern.compile("[^a-z0-9а-яіїєґ+]+",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private SupplyText() {
    }

    /** Memory key: text + variant, lower case, single spaces, at most 255 characters. */
    public static String sourceKey(String text, String variant) {
        String joined = variant != null && !variant.isEmpty() ? text + " | " + variant : text;
        String key = trim(WS_RUN.matcher(joined.toLowerCase(Locale.ROOT)).replaceAll(" "));
        return key.length() > 255 ? key.substring(0, 255) : key;
    }

    /** Latin / digit / Cyrillic words for catalog search: "ZP1 Advanced 490*420" gives zp1, advanced, 490, 420. */
    public static List<String> words(String s) {
        List<String> out = new ArrayList<>();
        if (s == null || s.isEmpty()) {
            return out;
        }
        for (String w : NON_WORD.split(s.toLowerCase(Locale.ROOT).replace('ё', 'е'), -1)) {
            if (!w.isEmpty()) {
                out.add(w);
            }
        }
        return out;
    }

    /** JS {@code String.prototype.trim}. */
    static String trim(String s) {
        return WS_EDGE.matcher(s).replaceAll("");
    }

    /** JS {@code trim().toLowerCase()} with runs of spaces collapsed. */
    static String norm(String s) {
        return trim(WS_RUN.matcher(s).replaceAll(" ")).toLowerCase(Locale.ROOT);
    }

    /** A number the way JS prints it in a template string: 134.67, 538, no trailing ".0". */
    static String num(Double d) {
        if (d == null) {
            return "null";
        }
        if (d == 0) {
            return "0";
        }
        return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
    }
}
