package com.maxsolch.shop.catalog.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.maxsolch.shop.ai.domain.FieldChange;
import com.maxsolch.shop.ai.domain.SubjectFields;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The card of a product as the AI sees it for «Принять безопасное» and its undo ({@link SubjectFields}): the fields are
 * {@code title}, {@code description}, {@code category}, {@code brand} and {@code spec:<key>} for every characteristic
 * (the value is its JSON text, an empty field is absent). Giving back a field also removes its confidence mark from
 * {@code card_meta}, so the card does not keep a source for a value that is gone. For the journal of applications the
 * card also shows what an application writes beside the fields ({@link CardApplyExtras}: photos, translations, card
 * status, confidence and journal, storefront); when the journal itself is given back whole, the marks go with it.
 */
@Component
public class ProductCardFields implements SubjectFields {

    private static final String SPEC = "spec:";

    private final ProductRepository products;
    private final CatalogDirectory directory;
    private final SiteRevalidator site;
    private final CardApplyExtras extras;

    public ProductCardFields(ProductRepository products, CatalogDirectory directory, SiteRevalidator site,
                             CardApplyExtras extras) {
        this.products = products;
        this.directory = directory;
        this.site = site;
        this.extras = extras;
    }

    @Override
    public String subjectType() {
        return CardAiJobs.SUBJECT;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> snapshot(String subjectId) {
        Product p = products.findById(UuidUtil.toBytes(subjectId))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
        return fields(p);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> applySnapshot(String subjectId) {
        Product p = products.findById(UuidUtil.toBytes(subjectId))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
        return applyFields(p);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Map<String, String>> find(String subjectId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(subjectId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return products.findById(id).map(ProductCardFields::fields);
    }

    @Override
    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    public Reverted revertUnchanged(String subjectId, Map<String, FieldChange> changes) {
        Product p = products.findByIdForUpdate(UuidUtil.toBytes(subjectId)).orElse(null);
        if (p == null) {
            return new Reverted(List.of(), List.copyOf(changes.keySet()));
        }
        Map<String, String> now = applyFields(p);
        List<String> reverted = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        Map<String, Object> specs = SpecsJson.readMap(p.getSpecsJson());
        Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
        CardApplyExtras.Undo undo = new CardApplyExtras.Undo();
        FieldChange wholeMeta = null;
        boolean plain = false;
        for (Map.Entry<String, FieldChange> e : changes.entrySet()) {
            String key = e.getKey();
            String before = e.getValue().before();
            boolean unchanged = Objects.equals(now.get(key), e.getValue().after());
            if (unchanged && key.equals(CardApplyExtras.META)) {
                wholeMeta = e.getValue();
            } else if (unchanged && CardApplyExtras.handles(key)) {
                unchanged = extras.putBack(p, key, before, undo);
            } else if (unchanged) {
                putBack(p, specs, meta, key, before);
                plain = true;
            }
            (unchanged ? reverted : skipped).add(key);
        }
        if (!reverted.isEmpty()) {
            if (plain) {
                p.changeSpecs(SpecsJson.write(specs));
            }
            // The journal given back whole already has the marks of the given-back characteristics as they were.
            if (wholeMeta != null) {
                p.recordCardMeta(wholeMeta.before());
            } else if (plain) {
                p.recordCardMeta(SpecsJson.write(meta));
            }
            products.save(p);
            extras.finish(undo);
            directory.evictAll();
            site.allChanged();
        }
        return new Reverted(reverted, skipped);
    }

    private Map<String, String> applyFields(Product p) {
        Map<String, String> out = fields(p);
        extras.read(p, out);
        return out;
    }

    private static Map<String, String> fields(Product p) {
        Map<String, String> out = new LinkedHashMap<>();
        put(out, "title", p.getTitle());
        put(out, "description", p.getDescription());
        put(out, "category", ProductCatalogFields.categoryId(p));
        put(out, "brand", ProductCatalogFields.brandId(p));
        SpecsJson.readMap(p.getSpecsJson()).forEach((k, v) -> put(out, SPEC + k, text(v)));
        return out;
    }

    private static void put(Map<String, String> out, String key, String value) {
        if (value != null && !value.isBlank()) {
            out.put(key, value);
        }
    }

    private static String text(Object value) {
        try {
            return value == null ? null : SpecsJson.MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void putBack(Product p, Map<String, Object> specs, Map<String, Object> meta, String key, String before) {
        if (key.startsWith(SPEC)) {
            String name = key.substring(SPEC.length());
            if (before == null) {
                specs.remove(name);
            } else {
                specs.put(name, value(before));
            }
            dropMark(meta, name);
            return;
        }
        switch (key) {
            case "title" -> p.retitle(before);
            case "description" -> p.redescribe(before);
            case "category" -> p.categorize(before == null ? null : UuidUtil.toBytes(before));
            case "brand" -> p.assignBrand(before == null ? null : UuidUtil.toBytes(before));
            default -> {
                // an unknown field has nothing to give back
            }
        }
    }

    private static Object value(String json) {
        try {
            return SpecsJson.MAPPER.readValue(json, Object.class);
        } catch (JsonProcessingException e) {
            return json;
        }
    }

    /** The confidence mark of a characteristic and its line in the «last import» journal. */
    @SuppressWarnings("unchecked")
    private static void dropMark(Map<String, Object> meta, String name) {
        if (meta.get("fields") instanceof Map<?, ?> m) {
            Map<String, Object> fields = new LinkedHashMap<>((Map<String, Object>) m);
            fields.remove(name);
            meta.put("fields", fields);
        }
        if (meta.get("last") instanceof Map<?, ?> last && last.get("changed") instanceof Map<?, ?> changed
                && changed.get("specs") instanceof Map<?, ?> specs) {
            Map<String, Object> lastCopy = new LinkedHashMap<>((Map<String, Object>) last);
            Map<String, Object> changedCopy = new LinkedHashMap<>((Map<String, Object>) changed);
            Map<String, Object> specsCopy = new LinkedHashMap<>((Map<String, Object>) specs);
            specsCopy.remove(name);
            changedCopy.put("specs", specsCopy);
            lastCopy.put("changed", changedCopy);
            meta.put("last", lastCopy);
        }
    }
}
