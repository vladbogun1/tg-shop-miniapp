package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * The «card_meta» journal of a product card: confidence and source per characteristic, the snapshot of what the last
 * AI import changed ({@code last}: before → after) and how the admin's own edits are merged into it.
 */
@Component
class CardMeta {

    private final Clock clock;

    CardMeta(Clock clock) {
        this.clock = clock;
    }

    /**
     * What one import changed: {@code category} / {@code brand} {before, after}, {@code specs}
     * {key: {before, after, c?, src?}} and {@code texts} {"lang/field": {before, after}} — changes only.
     */
    Map<String, Object> changes(String catBefore, String catAfter, String brandBefore, String brandAfter,
                                       Map<String, Object> specsBefore, Map<String, Object> specsAfter,
                                       Map<String, Object[]> texts, CardImportItem item) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!Objects.equals(catBefore, catAfter)) {
            out.put("category", beforeAfter(catBefore, catAfter));
        }
        if (!Objects.equals(brandBefore, brandAfter)) {
            out.put("brand", beforeAfter(brandBefore, brandAfter));
        }
        Map<String, Object> specs = new LinkedHashMap<>();
        Set<String> keys = new LinkedHashSet<>(specsAfter.keySet());
        keys.addAll(specsBefore.keySet());
        for (String k : keys) {
            Object b = specsBefore.get(k);
            Object a = specsAfter.get(k);
            if (Objects.equals(b, a)) {
                continue;
            }
            Map<String, Object> e = beforeAfter(b, a);
            Integer c = confidenceOf(item.confidence() == null ? null : item.confidence().get(k));
            if (c != null) {
                e.put("c", c);
            }
            String src = sourceOf(item, k);
            if (src != null) {
                e.put("src", src);
            }
            specs.put(k, e);
        }
        out.put("specs", specs);
        Map<String, Object> textsOut = new LinkedHashMap<>();
        texts.forEach((k, v) -> textsOut.put(k, beforeAfter(v[0], v[1])));
        out.put("texts", textsOut);
        return out;
    }

    private static Map<String, Object> beforeAfter(Object before, Object after) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("before", before);
        m.put("after", after);
        return m;
    }

    Map<String, Object> lastOf(Map<String, Object> changed, CardImportItem item) {
        Map<String, Object> last = new LinkedHashMap<>();
        last.put("at", clock.instant().toString());
        if (item.model() != null) {
            last.put("model", cut(item.model(), 120));
        }
        last.put("changed", changed);
        return last;
    }

    /**
     * The admin's edits on top of the last AI import: an entry already there keeps its «before»
     * (the value before the AI) and gets the new «after»; a new one is added. Both get edited=true.
     */
    @SuppressWarnings("unchecked")
    Map<String, Object> mergeLast(Object old, Map<String, Object> edits) {
        Map<String, Object> last = old instanceof Map<?, ?> m ? new LinkedHashMap<>((Map<String, Object>) m)
                : new LinkedHashMap<>();
        Map<String, Object> changed = last.get("changed") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        for (String scalar : List.of("category", "brand")) {
            if (edits.get(scalar) instanceof Map<?, ?> e) {
                changed.put(scalar, edited(changed.get(scalar), (Map<String, Object>) e));
            }
        }
        for (String group : List.of("specs", "texts")) {
            Map<String, Object> target = changed.get(group) instanceof Map<?, ?> m
                    ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
            if (edits.get(group) instanceof Map<?, ?> g) {
                for (Map.Entry<String, Object> e : ((Map<String, Object>) g).entrySet()) {
                    target.put(e.getKey(), edited(target.get(e.getKey()), (Map<String, Object>) e.getValue()));
                }
            }
            changed.put(group, target);
        }
        String now = clock.instant().toString();
        last.putIfAbsent("at", now);
        last.put("editedAt", now);
        last.put("changed", changed);
        return last;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> edited(Object old, Map<String, Object> edit) {
        Map<String, Object> e = old instanceof Map<?, ?> m ? new LinkedHashMap<>((Map<String, Object>) m)
                : new LinkedHashMap<>(edit);
        e.put("after", edit.get("after"));
        e.put("edited", true);
        return e;
    }

    /** card_meta: confidence (+ source) per field (merged), sources, notes, model, overall, importedAt. */
    @SuppressWarnings("unchecked")
    Map<String, Object> meta(Product p, CardImportItem item) {
        Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
        Map<String, Object> fields = meta.get("fields") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m) : new LinkedHashMap<>();
        if (item.confidence() != null) {
            for (Map.Entry<String, Object> e : item.confidence().entrySet()) {
                Integer c = confidenceOf(e.getValue());
                if (c != null) {
                    Map<String, Object> f = new LinkedHashMap<>();
                    f.put("c", c);
                    String src = sourceOf(item, e.getKey());
                    if (src != null) {
                        f.put("src", src);
                    }
                    fields.put(e.getKey(), f);
                }
            }
        }
        meta.put("fields", fields);
        if (item.sources() != null) {
            meta.put("sources", item.sources().stream().filter(Objects::nonNull).limit(50).toList());
        }
        if (item.notes() != null) {
            meta.put("notes", cut(item.notes(), 4000));
        }
        if (item.model() != null) {
            meta.put("model", cut(item.model(), 120));
        }
        if (item.overall() != null) {
            meta.put("overall", Math.max(0, Math.min(100, item.overall())));
        }
        meta.put("importedAt", clock.instant().toString());
        return meta;
    }

    private static Integer confidenceOf(Object v) {
        return v instanceof Number n ? Math.max(0, Math.min(100, n.intValue())) : null;
    }

    /** Source url the AI named for one characteristic (http/https only). */
    private static String sourceOf(CardImportItem item, String key) {
        String src = item.fieldSources() == null ? null : trimToNull(item.fieldSources().get(key));
        return src != null && src.matches("(?i)^https?://\\S+$") ? cut(src, 500) : null;
    }

    static String cut(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }
}
