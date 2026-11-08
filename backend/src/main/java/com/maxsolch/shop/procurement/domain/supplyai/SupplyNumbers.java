package com.maxsolch.shop.procurement.domain.supplyai;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.regex.Pattern;

/**
 * A number from an AI answer: a JSON number or a string like "¥1 234,50", "$42.50", "1,234.50", "10 zł".
 * Same logic as num() in frontend-admin/features/supply/model/ai/parse.ts.
 */
public final class SupplyNumbers {

    /** Currency at the edges of the number: a symbol or a code. Other text ("12 pcs x2") is not a number. */
    private static final Pattern MONEY_TOKENS = Pattern.compile(
            "^(?:[¥$€₴]|zł|rmb|cny|usd|eur|uah|pln|грн\\.?)[" + SupplyText.WS + "]*"
                    + "|[" + SupplyText.WS + "]*(?:[¥$€₴]|zł|rmb|cny|usd|eur|uah|pln|грн\\.?)\\z",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern SPACES = Pattern.compile("[" + SupplyText.WS + "\\u00a0\\u202f']");
    private static final Pattern PLAIN = Pattern.compile("-?\\d[\\d.,]*");
    private static final Pattern NONZERO_DIGIT = Pattern.compile("[1-9]");

    private SupplyNumbers() {
    }

    /** A number or null. */
    public static Double num(JsonNode v) {
        if (v == null) {
            return null;
        }
        if (v.isNumber()) {
            double d = v.asDouble();
            return Double.isFinite(d) ? d : null;
        }
        return v.isTextual() ? num(v.asText()) : null;
    }

    public static Double num(String v) {
        String bare = SPACES.matcher(MONEY_TOKENS.matcher(SupplyText.trim(v)).replaceAll("")).replaceAll("");
        if (!PLAIN.matcher(bare).matches()) {
            return null;
        }
        String dec = decimalOf(bare);
        if (dec == null) {
            return null;
        }
        double n = Double.parseDouble(dec);
        return Double.isFinite(n) ? n : null;
    }

    /**
     * Without thousands separators: the last of "." / "," is the decimal one; a single separator followed by
     * exactly three digits is thousands.
     */
    static String decimalOf(String s) {
        int dot = s.lastIndexOf('.');
        int comma = s.lastIndexOf(',');
        if (dot >= 0 && comma >= 0) {
            return bothSeparators(s, dot > comma ? '.' : ',');
        }
        char sep = dot >= 0 ? '.' : ',';
        if (dot < 0 && comma < 0) {
            return s;
        }
        String[] parts = s.split(Pattern.quote(String.valueOf(sep)), -1);
        boolean thousands = parts.length > 2 || (parts[1].length() == 3 && NONZERO_DIGIT.matcher(parts[0]).find());
        if (!thousands) {
            return String.join(".", parts);
        }
        for (int i = 0; i < parts.length; i++) {
            boolean ok = i == 0 ? parts[i].length() >= 1 && parts[i].length() <= 3 : parts[i].length() == 3;
            if (!ok) {
                return null;
            }
        }
        return String.join("", parts);
    }

    private static String bothSeparators(String s, char dec) {
        char thousands = dec == '.' ? ',' : '.';
        String[] parts = s.split(Pattern.quote(String.valueOf(dec)), -1);
        if (parts.length > 2 || parts[1].indexOf(thousands) >= 0) {
            return null;
        }
        return parts[0].replace(String.valueOf(thousands), "") + "." + parts[1];
    }
}
