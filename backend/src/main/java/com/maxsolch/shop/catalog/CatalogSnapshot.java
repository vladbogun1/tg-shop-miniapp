package com.maxsolch.shop.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Immutable, detached copy of the whole catalog schema (categories, brands, groups, attributes with
 * options) — a few hundred rows, read whole and cached ({@link CatalogDirectory}). Everything that
 * needs the tree (product DTOs, filters, validation) works on this instead of on JPA entities.
 */
public final class CatalogSnapshot {

    public record Cat(String id, String parentId, String name, String slug, int sortOrder, boolean showInMenu,
                      String artKind, String seoTitle, String seoDescription, String h1, String introText) {
    }

    public record BrandInfo(String id, String name, String slug, List<String> aliases, String website,
                            int sortOrder, String logoUrl, String logoMode) {
    }

    public record Group(String key, String labelRu, String labelUk, String labelEn, int sort) {
        public String label(String lang) {
            return pick(lang, labelRu, labelUk, labelEn);
        }
    }

    public record Option(String value, String labelRu, String labelUk, String labelEn, List<String> aliases,
                         int sort) {
        public String label(String lang) {
            return pick(lang, labelRu, labelUk, labelEn);
        }
    }

    /** Number facet bucket; inclusive bounds, null = open. The id is derived from the bounds. */
    public record Bucket(String id, Double min, Double max, String labelRu, String labelUk, String labelEn) {
        public String label(String lang) {
            return pick(lang, labelRu, labelUk, labelEn);
        }
    }

    public record Attr(String id, String categoryId, String key, String labelRu, String labelUk, String labelEn,
                       SpecType type, String unitRu, String unitUk, String unitEn, boolean range, String group,
                       boolean filterable, boolean comparable, boolean required, boolean highlight, int sort,
                       List<Bucket> buckets, String hint, List<Option> options) {
        public String label(String lang) {
            return pick(lang, labelRu, labelUk, labelEn);
        }

        public String unit(String lang) {
            return pick(lang, unitRu, unitUk, unitEn);
        }
    }

    public static final CatalogSnapshot EMPTY = new CatalogSnapshot(List.of(), List.of(), List.of(), List.of());

    private final List<Cat> categories;
    private final List<BrandInfo> brands;
    private final List<Group> groups;
    private final List<Attr> attributes;
    private final Map<String, Cat> byId = new HashMap<>();
    private final Map<String, Cat> bySlug = new HashMap<>();
    private final Map<String, List<Cat>> children = new HashMap<>();
    private final Map<String, BrandInfo> brandById = new HashMap<>();

    public CatalogSnapshot(List<Cat> categories, List<BrandInfo> brands, List<Group> groups, List<Attr> attributes) {
        Comparator<Cat> order = Comparator.comparingInt(Cat::sortOrder).thenComparing(Cat::name);
        this.categories = categories.stream().sorted(order).toList();
        this.brands = brands.stream()
                .sorted(Comparator.comparingInt(BrandInfo::sortOrder).thenComparing(b -> b.name().toLowerCase(Locale.ROOT)))
                .toList();
        this.groups = groups.stream().sorted(Comparator.comparingInt(Group::sort).thenComparing(Group::key)).toList();
        this.attributes = attributes.stream().sorted(Comparator.comparingInt(Attr::sort).thenComparing(Attr::key)).toList();
        for (Cat c : this.categories) {
            byId.put(c.id(), c);
            bySlug.put(c.slug(), c);
            children.computeIfAbsent(c.parentId(), k -> new ArrayList<>()).add(c);
        }
        for (BrandInfo b : this.brands) {
            brandById.put(b.id(), b);
        }
    }

    public List<Cat> categories() {
        return categories;
    }

    public List<BrandInfo> brands() {
        return brands;
    }

    public List<Group> groups() {
        return groups;
    }

    public List<Attr> attributes() {
        return attributes;
    }

    public Cat category(String id) {
        return id == null ? null : byId.get(id);
    }

    public Cat categoryBySlug(String slug) {
        return slug == null ? null : bySlug.get(slug.trim().toLowerCase(Locale.ROOT));
    }

    public BrandInfo brand(String id) {
        return id == null ? null : brandById.get(id);
    }

    /** Children of a category ({@code null} = the roots), by sort order then name. */
    public List<Cat> children(String parentId) {
        return children.getOrDefault(parentId, List.of());
    }

    public boolean isLeaf(String id) {
        return children(id).isEmpty();
    }

    /** Root → … → the category; empty for an unknown id. */
    public List<Cat> path(String id) {
        List<Cat> out = new ArrayList<>();
        Cat c = category(id);
        for (int guard = 0; c != null && guard < 10; guard++) {
            out.add(c);
            c = category(c.parentId());
        }
        Collections.reverse(out);
        return out;
    }

    /** The root of the category's path (the category itself for a root); null for unknown. */
    public Cat root(String id) {
        List<Cat> p = path(id);
        return p.isEmpty() ? null : p.get(0);
    }

    /** The category and all its descendants. */
    public Set<String> subtree(String id) {
        Set<String> out = new LinkedHashSet<>();
        collect(id, out, 0);
        return out;
    }

    private void collect(String id, Set<String> out, int depth) {
        if (id == null || depth > 10 || !out.add(id)) {
            return;
        }
        for (Cat c : children(id)) {
            collect(c.id(), out, depth + 1);
        }
    }

    /** Depth-first: each root followed by its children (the order of flat lists). */
    public List<Cat> treeOrder() {
        List<Cat> out = new ArrayList<>();
        for (Cat r : children(null)) {
            out.add(r);
            out.addAll(children(r.id()));
        }
        // Defensive: anything unreachable (a broken parent) at the end.
        if (out.size() < categories.size()) {
            for (Cat c : categories) {
                if (!out.contains(c)) {
                    out.add(c);
                }
            }
        }
        return out;
    }

    /** Attributes that apply to a category: global → root → … → the category itself, by sort. */
    public List<Attr> attributesFor(String categoryId) {
        List<Cat> p = path(categoryId);
        Map<String, Integer> rank = new HashMap<>();
        rank.put(null, 0);
        for (int i = 0; i < p.size(); i++) {
            rank.put(p.get(i).id(), i + 1);
        }
        return attributes.stream()
                .filter(a -> rank.containsKey(a.categoryId()))
                .sorted(Comparator.<Attr>comparingInt(a -> rank.get(a.categoryId())).thenComparingInt(Attr::sort))
                .toList();
    }

    /** Keys of required attributes of the category path (+ global) absent from the specs. */
    public List<String> missingRequired(String categoryId, Map<String, Object> specs) {
        List<String> out = new ArrayList<>();
        for (Attr a : attributesFor(categoryId)) {
            if (a.required() && (specs == null || specs.get(a.key()) == null)) {
                out.add(a.key());
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ helpers

    public static String pick(String lang, String ru, String uk, String en) {
        String v = switch (lang == null ? "uk" : lang) {
            case "ru" -> ru;
            case "en" -> en;
            default -> uk;
        };
        return v == null || v.isBlank() ? ru : v;
    }

    /**
     * Stable bucket id from its bounds: {@code null..44.9 → "lt45"}, {@code 65..null → "gte65"},
     * {@code 45..54.9 → "45-54_9"}.
     */
    public static String bucketId(Double min, Double max) {
        if (min == null && max == null) {
            return "all";
        }
        if (min == null) {
            return "lt" + fmt(Math.ceil(max));
        }
        if (max == null) {
            return "gte" + fmt(min);
        }
        return fmt(min) + "-" + fmt(max);
    }

    static String fmt(double d) {
        String s = BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
        return s.replace('.', '_').replace('-', 'm');
    }
}
