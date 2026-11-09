package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The variant each line of a new product gets. The admin's (or the AI's) word wins. Lines of one new product without
 * it: the same position of the invoice twice — no variant, they add up; different positions (a Soft and an Xsoft, a
 * plain and a tube packaging) — each gets the words that tell it from the others (from the English line, else the
 * document text): «Xsoft gift tube packaging». So lines of one product never block the acceptance — the admin only
 * renames a variant if the words are clumsy. Same logic as variants.ts in frontend-admin/features/supply/model/ai.
 */
public final class SupplyVariants {

    private static final String SPLIT = "[\\s,;/()]+";

    private SupplyVariants() {
    }

    /** Line id → its variant (absent — the line has none). Only lines decided «new». */
    public static Map<String, String> of(List<ReviewRow> rows) {
        Map<String, List<ReviewRow>> groups = new LinkedHashMap<>();
        for (ReviewRow r : rows) {
            if ("new".equals(r.decision().kind())) {
                groups.computeIfAbsent(SupplyPlan.draftKey(r.decision().draft()), k -> new ArrayList<>()).add(r);
            }
        }
        Map<String, String> out = new HashMap<>();
        groups.values().forEach(g -> group(g, out));
        return out;
    }

    private static void group(List<ReviewRow> g, Map<String, String> out) {
        boolean derive = g.stream().map(SupplyVariants::key).distinct().count() > 1;
        Set<String> common = derive ? common(g) : Set.of();
        Map<String, String> owner = new HashMap<>();
        Map<String, String> byKey = new HashMap<>();
        for (ReviewRow r : g) {
            String own = explicit(r);
            if (own != null) {
                out.put(r.line().id(), own);
                owner.putIfAbsent(own.toLowerCase(Locale.ROOT), key(r));
                byKey.putIfAbsent(key(r), own);
            }
        }
        for (ReviewRow r : g) {
            if (explicit(r) != null) {
                continue;
            }
            if (byKey.containsKey(key(r))) {
                out.put(r.line().id(), byKey.get(key(r)));       // the same position as a line the admin named
                continue;
            }
            if (!derive) {
                continue;
            }
            String name = distinct(r, common);
            String taken = owner.putIfAbsent(name.toLowerCase(Locale.ROOT), key(r));
            if (taken != null && !taken.equals(key(r))) {
                name = name + " " + r.line().id();
            }
            out.put(r.line().id(), name);
        }
    }

    private static String explicit(ReviewRow r) {
        String v = r.decision().draft().variant();
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static String key(ReviewRow r) {
        return SupplyText.sourceKey(r.line().text(), r.line().variant());
    }

    private static List<String> words(ReviewRow r) {
        SourceLine l = r.line();
        String base = l.en() != null && !l.en().isBlank() ? l.en() : l.text() + (l.variant() == null ? "" : " " + l.variant());
        return Arrays.stream(base.trim().split(SPLIT)).filter(w -> !w.isEmpty()).toList();
    }

    /** Words (in lower case) every line of the product has. */
    private static Set<String> common(List<ReviewRow> g) {
        Set<String> out = null;
        for (ReviewRow r : g) {
            Set<String> mine = new HashSet<>();
            words(r).forEach(w -> mine.add(w.toLowerCase(Locale.ROOT)));
            if (out == null) {
                out = mine;
            } else {
                out.retainAll(mine);
            }
        }
        return out == null ? Set.of() : out;
    }

    private static String distinct(ReviewRow r, Set<String> common) {
        Set<String> seen = new HashSet<>();
        List<String> own = words(r).stream()
                .filter(w -> !common.contains(w.toLowerCase(Locale.ROOT)) && seen.add(w.toLowerCase(Locale.ROOT))).toList();
        if (!own.isEmpty()) {
            return String.join(" ", own);
        }
        String v = r.line().variant();
        return v != null && !v.isBlank() ? v.trim() : r.line().id();
    }
}
