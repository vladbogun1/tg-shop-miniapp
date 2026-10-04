package com.maxsolch.shop.repository;

import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The admin's order-search box, turned into the parameters of {@link OrderSearchQueries#TEXT}.
 *
 * @param like  lowercased {@code %term%} with LIKE wildcards escaped by {@code !}, or null
 * @param idLo  lowest order id the term can denote as an id prefix, or null when it cannot be one
 * @param idHi  highest such id (inclusive)
 */
public record OrderSearchTerm(String like, byte[] idLo, byte[] idHi) {

    /**
     * Order ids are shown as their first 8 hex characters ({@code #5bf865c4}). Shorter prefixes are
     * accepted down to this length; below it an ordinary word made of a–f letters ("cafe") would
     * start matching random orders.
     */
    static final int MIN_ID_PREFIX = 4;

    private static final Pattern HEX = Pattern.compile("[0-9a-f]+");

    public static final OrderSearchTerm NONE = new OrderSearchTerm(null, null, null);

    public static OrderSearchTerm parse(String q) {
        if (q == null || q.isBlank()) {
            return NONE;
        }
        String term = q.trim().toLowerCase(Locale.ROOT);
        String escaped = term.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String like = "%" + escaped + "%";

        String id = term.startsWith("#") ? term.substring(1).trim() : term;
        id = id.replace("-", "");
        if (id.length() < MIN_ID_PREFIX || id.length() > 32 || !HEX.matcher(id).matches()) {
            return new OrderSearchTerm(like, null, null);
        }
        HexFormat hex = HexFormat.of();
        byte[] lo = hex.parseHex(pad(id, '0'));
        byte[] hi = hex.parseHex(pad(id, 'f'));
        return new OrderSearchTerm(like, lo, hi);
    }

    private static String pad(String prefix, char fill) {
        StringBuilder sb = new StringBuilder(32).append(prefix);
        while (sb.length() < 32) {
            sb.append(fill);
        }
        return sb.toString();
    }
}
