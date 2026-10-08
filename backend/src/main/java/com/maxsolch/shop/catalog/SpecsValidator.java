package com.maxsolch.shop.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks product characteristics against the schema of a category (docs/CATALOG-SPECS.md §2). One
 * implementation for the product form, the AI cards import and schema changes; the admin's
 * {@code card-check.ts} mirrors it for UX only.
 *
 * <p>A bad field is dropped with an issue, the rest is kept. Enum/multi values are matched by
 * option value, then case-insensitively by value, label (ru/uk/en) or alias. A {@code null} value
 * means "unknown" and is dropped silently.
 */
public final class SpecsValidator {

    public static final double MAX_NUMBER = 10_000_000d;
    public static final int MAX_TEXT = 255;

    /** One dropped field (or one dropped value of a multi). {@code reason} is a stable code. */
    public record Issue(String key, String reason, String message) {
    }

    public record Result(Map<String, Object> specs, List<Issue> issues) {
        public boolean ok() {
            return issues.isEmpty();
        }
    }

    private static final Pattern RANGE = Pattern.compile("^\\s*(-?[0-9]+(?:[.,][0-9]+)?)\\s*(?:-|–|—|\\.\\.)\\s*(-?[0-9]+(?:[.,][0-9]+)?)\\s*$");

    private SpecsValidator() {
    }

    /**
     * @param attributes the attributes that apply (global + category path, see
     *                   {@link CatalogSnapshot#attributesFor})
     * @param raw        attribute key → value as parsed from JSON (may be null)
     * @return the cleaned specs in schema order + what was dropped
     */
    public static Result validate(List<CatalogSnapshot.Attr> attributes, Map<String, ?> raw) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Issue> issues = new ArrayList<>();
        if (raw == null || raw.isEmpty()) {
            return new Result(out, issues);
        }
        Map<String, CatalogSnapshot.Attr> byKey = new LinkedHashMap<>();
        for (CatalogSnapshot.Attr a : attributes) {
            byKey.putIfAbsent(a.key(), a);
        }
        for (Map.Entry<String, ?> e : raw.entrySet()) {
            if (e.getKey() == null || !byKey.containsKey(e.getKey())) {
                issues.add(new Issue(e.getKey(), "UNKNOWN_KEY", "нет такой характеристики в категории"));
            }
        }
        for (CatalogSnapshot.Attr a : byKey.values()) {
            if (!raw.containsKey(a.key())) {
                continue;
            }
            Object v = raw.get(a.key());
            if (v == null) {
                continue;
            }
            Object clean = switch (a.type()) {
                case NUMBER -> number(a, v, issues);
                case ENUM -> enumValue(a, v, issues);
                case MULTI -> multi(a, v, issues);
                case BOOL -> bool(a, v, issues);
                case TEXT -> text(a, v, issues);
            };
            if (clean != null) {
                out.put(a.key(), clean);
            }
        }
        return new Result(out, issues);
    }

    // ------------------------------------------------------------------ types

    private static Object number(CatalogSnapshot.Attr a, Object v, List<Issue> issues) {
        Double min;
        Double max;
        if (v instanceof Map<?, ?> m) {
            min = toDouble(m.get("min"));
            max = toDouble(m.get("max"));
            if (min == null && max != null) {
                min = max;
            }
            if (max == null && min != null) {
                max = min;
            }
        } else if (v instanceof String s && RANGE.matcher(s).matches()) {
            Matcher mm = RANGE.matcher(s);
            mm.matches();
            min = toDouble(mm.group(1));
            max = toDouble(mm.group(2));
        } else {
            min = toDouble(v);
            max = min;
        }
        if (min == null || max == null) {
            issues.add(new Issue(a.key(), "NOT_A_NUMBER", "не число: " + abbreviate(v)));
            return null;
        }
        if (min < 0 || max < 0 || min > MAX_NUMBER || max > MAX_NUMBER) {
            issues.add(new Issue(a.key(), "OUT_OF_RANGE", "число вне 0…10 000 000: " + abbreviate(v)));
            return null;
        }
        if (min > max) {
            issues.add(new Issue(a.key(), "MIN_GT_MAX", "min больше max: " + abbreviate(v)));
            return null;
        }
        if (a.range()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("min", normalize(min));
            r.put("max", normalize(max));
            return r;
        }
        if (!min.equals(max)) {
            issues.add(new Issue(a.key(), "NOT_A_NUMBER", "ожидалось одно число, а не диапазон: " + abbreviate(v)));
            return null;
        }
        return normalize(min);
    }

    private static Object enumValue(CatalogSnapshot.Attr a, Object v, List<Issue> issues) {
        if (v instanceof List<?> l && l.size() == 1) {
            v = l.get(0);
        }
        if (!(v instanceof String) && !(v instanceof Number)) {
            issues.add(new Issue(a.key(), "NOT_A_STRING", "ожидалось значение из списка: " + abbreviate(v)));
            return null;
        }
        String found = resolveOption(a, v.toString());
        if (found == null) {
            issues.add(new Issue(a.key(), "UNKNOWN_OPTION", "нет такого варианта: " + abbreviate(v)));
        }
        return found;
    }

    private static Object multi(CatalogSnapshot.Attr a, Object v, List<Issue> issues) {
        List<?> list;
        if (v instanceof List<?> l) {
            list = l;
        } else if (v instanceof String s) {
            list = List.of(s);
        } else {
            issues.add(new Issue(a.key(), "NOT_A_LIST", "ожидался список значений: " + abbreviate(v)));
            return null;
        }
        Set<String> out = new LinkedHashSet<>();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            String found = item instanceof String || item instanceof Number ? resolveOption(a, item.toString()) : null;
            if (found == null) {
                issues.add(new Issue(a.key(), "UNKNOWN_OPTION", "нет такого варианта: " + abbreviate(item)));
            } else {
                out.add(found);
            }
        }
        if (out.isEmpty()) {
            return null;
        }
        // Schema order, not the order the AI happened to list them in.
        List<String> ordered = new ArrayList<>();
        for (CatalogSnapshot.Option o : a.options()) {
            if (out.contains(o.value())) {
                ordered.add(o.value());
            }
        }
        return ordered;
    }

    private static Object bool(CatalogSnapshot.Attr a, Object v, List<Issue> issues) {
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n && (n.intValue() == 0 || n.intValue() == 1) && n.doubleValue() == n.intValue()) {
            return n.intValue() == 1;
        }
        if (v instanceof String s) {
            switch (s.trim().toLowerCase(Locale.ROOT)) {
                case "true", "yes", "да", "так", "1", "есть", "є" -> {
                    return true;
                }
                case "false", "no", "нет", "ні", "0" -> {
                    return false;
                }
                default -> {
                }
            }
        }
        issues.add(new Issue(a.key(), "NOT_A_BOOL", "ожидалось да/нет: " + abbreviate(v)));
        return null;
    }

    private static Object text(CatalogSnapshot.Attr a, Object v, List<Issue> issues) {
        if (!(v instanceof String) && !(v instanceof Number)) {
            issues.add(new Issue(a.key(), "NOT_A_STRING", "ожидалась строка: " + abbreviate(v)));
            return null;
        }
        String s = v.toString().trim().replaceAll("\\s+", " ");
        if (s.isEmpty()) {
            issues.add(new Issue(a.key(), "EMPTY", "пустая строка"));
            return null;
        }
        if (s.length() > MAX_TEXT) {
            issues.add(new Issue(a.key(), "TOO_LONG", "длиннее " + MAX_TEXT + " символов"));
            return null;
        }
        return s;
    }

    // ------------------------------------------------------------------ helpers

    /** Option value for a raw string: exact value, then case-insensitive value/label/alias; else null. */
    public static String resolveOption(CatalogSnapshot.Attr a, String raw) {
        if (raw == null || a.options() == null) {
            return null;
        }
        String s = raw.trim();
        for (CatalogSnapshot.Option o : a.options()) {
            if (o.value().equals(s)) {
                return o.value();
            }
        }
        String n = norm(s);
        if (n.isEmpty()) {
            return null;
        }
        for (CatalogSnapshot.Option o : a.options()) {
            if (norm(o.value()).equals(n) || n.equals(norm(o.labelRu())) || n.equals(norm(o.labelUk()))
                    || n.equals(norm(o.labelEn()))) {
                return o.value();
            }
        }
        for (CatalogSnapshot.Option o : a.options()) {
            for (String alias : o.aliases()) {
                if (norm(alias).equals(n)) {
                    return o.value();
                }
            }
        }
        return null;
    }

    static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replace('ё', 'е').replaceAll("\\s+", " ");
    }

    static Double toDouble(Object v) {
        if (v instanceof Number n) {
            double d = n.doubleValue();
            return Double.isFinite(d) ? d : null;
        }
        if (v instanceof String s) {
            String t = s.trim().replace(" ", "").replace(" ", "").replace(',', '.');
            if (t.isEmpty()) {
                return null;
            }
            try {
                double d = Double.parseDouble(t);
                return Double.isFinite(d) ? d : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** Whole numbers as Long (51, not 51.0), the rest as a plain Double. */
    static Number normalize(double d) {
        if (d == Math.rint(d) && Math.abs(d) < 1e15) {
            return (long) d;
        }
        return new BigDecimal(Double.toString(d)).doubleValue();
    }

    private static String abbreviate(Object v) {
        String s = String.valueOf(v);
        return s.length() > 60 ? s.substring(0, 60) + "…" : s;
    }
}
