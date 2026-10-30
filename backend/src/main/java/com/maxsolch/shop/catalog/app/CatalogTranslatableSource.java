package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CategoryUpsertRequest;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.ProductVariantRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslatableSource;
import com.maxsolch.shop.translation.app.TranslationLimits;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** Catalog texts the translation module can translate: products, variants and categories (with their SEO fields). */
@Component
public class CatalogTranslatableSource implements TranslatableSource {

    private static final int TEXT = TranslationLimits.MAX_TEXT_CHARS;

    /** Column sizes of the Russian sources ({@code entityType:field} to max chars). */
    private static final Map<String, Integer> MAX_CHARS = Map.ofEntries(
            Map.entry("PRODUCT:title", 255),
            Map.entry("PRODUCT:description", TEXT),
            Map.entry("PRODUCT:seo_title", 255),
            Map.entry("PRODUCT:seo_description", 512),
            Map.entry("PRODUCT:condition_note", 255),
            Map.entry("VARIANT:name", 128),
            Map.entry("CATEGORY:name", 128),
            Map.entry("CATEGORY:seo_title", 255),
            Map.entry("CATEGORY:seo_description", 512),
            Map.entry("CATEGORY:h1", 255),
            Map.entry("CATEGORY:intro_text", CategoryUpsertRequest.INTRO_MAX_CHARS));

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final CategoryRepository categoryRepository;

    public CatalogTranslatableSource(ProductRepository productRepository, ProductVariantRepository variantRepository,
                              CategoryRepository categoryRepository) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.categoryRepository = categoryRepository;
    }

    @Override
    public Set<TranslationEntityType> types() {
        return Set.of(TranslationEntityType.PRODUCT, TranslationEntityType.VARIANT, TranslationEntityType.CATEGORY);
    }

    @Override
    public Integer maxSourceChars(TranslationEntityType type, String field) {
        return MAX_CHARS.get(type.name() + ":" + field);
    }

    @Override
    public Map<Key, Field> fields() {
        Map<Key, Field> out = new HashMap<>();
        for (Object[] r : productRepository.translationSources()) {
            String id = UuidUtil.toString((byte[]) r[0]);
            boolean live = Boolean.TRUE.equals(r[5]) && !Boolean.TRUE.equals(r[6]);
            String title = (String) r[1];
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, title, live, id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.DESCRIPTION, (String) r[2], live, id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_TITLE, (String) r[3], live, id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.SEO_DESCRIPTION, (String) r[4], live, id, title);
            put(out, TranslationEntityType.PRODUCT, id, TranslationEntityType.CONDITION_NOTE,
                    r.length > 7 ? (String) r[7] : null, live, id, title);
        }
        for (Object[] r : variantRepository.translationSources()) {
            boolean live = Boolean.TRUE.equals(r[2]) && !Boolean.TRUE.equals(r[3]);
            String productId = r.length > 4 && r[4] != null ? UuidUtil.toString((byte[]) r[4]) : null;
            String productTitle = r.length > 5 ? (String) r[5] : null;
            put(out, TranslationEntityType.VARIANT, UuidUtil.toString((byte[]) r[0]), TranslationEntityType.NAME,
                    (String) r[1], live, productId, productTitle);
        }
        for (Category t : categoryRepository.findAll()) {
            String id = UuidUtil.toString(t.getId());
            put(out, TranslationEntityType.CATEGORY, id, TranslationEntityType.NAME, t.getName(), true, null, null);
            // SEO fields carry the category name as context (ownerTitle; ownerId stays null),
            // so the translations screen and the AI prompt can tell whose page the text belongs to.
            for (String field : TranslationEntityType.CATEGORY.fields()) {
                if (!TranslationEntityType.NAME.equals(field)) {
                    put(out, TranslationEntityType.CATEGORY, id, field, categorySeoField(t, field), true, null,
                            t.getName());
                }
            }
        }
        return out;
    }

    private static void put(Map<Key, Field> out, TranslationEntityType type, String id, String field, String text,
                            boolean inScope, String ownerId, String ownerTitle) {
        out.put(new Key(type, id, field), new Field(text, inScope, ownerId, ownerTitle));
    }

    @Override
    public String applySource(SourceChange c) {
        return switch (c.type()) {
            case PRODUCT -> applyProduct(c);
            case VARIANT -> applyVariant(c);
            case CATEGORY -> applyCategory(c);
            default -> "INVALID_ENTITY_TYPE";
        };
    }

    private String applyProduct(SourceChange c) {
        Product p = productRepository.findById(c.entityId()).orElse(null);
        if (p == null) {
            return "NOT_FOUND";
        }
        String field = c.field();
        String current = switch (field) {
            case TranslationEntityType.TITLE -> p.getTitle();
            case TranslationEntityType.DESCRIPTION -> p.getDescription();
            case TranslationEntityType.SEO_TITLE -> p.getSeoTitle();
            case TranslationEntityType.CONDITION_NOTE -> p.getConditionNote();
            default -> p.getSeoDescription();
        };
        if (!c.holds(current)) {
            return "STALE";
        }
        switch (field) {
            case TranslationEntityType.TITLE -> p.setTitle(c.newSource());
            case TranslationEntityType.DESCRIPTION -> p.setDescription(c.newSource());
            case TranslationEntityType.SEO_TITLE -> p.setSeoTitle(c.newSource());
            case TranslationEntityType.CONDITION_NOTE -> p.setConditionNote(c.newSource());
            default -> p.setSeoDescription(c.newSource());
        }
        return "OK";
    }

    private String applyVariant(SourceChange c) {
        ProductVariant v = variantRepository.findById(c.entityId()).orElse(null);
        if (v == null) {
            return "NOT_FOUND";
        }
        if (!c.holds(v.getName())) {
            return "STALE";
        }
        v.setName(c.newSource());
        return "OK";
    }

    private String applyCategory(SourceChange c) {
        byte[] id = c.entityId();
        Category t = categoryRepository.findById(id).orElse(null);
        if (t == null) {
            return "NOT_FOUND";
        }
        if (!TranslationEntityType.NAME.equals(c.field())) {
            if (!c.holds(categorySeoField(t, c.field()))) {
                return "STALE";
            }
            setCategorySeoField(t, c.field(), c.newSource());
            return "OK";
        }
        if (!c.holds(t.getName())) {
            return "STALE";
        }
        boolean clash = categoryRepository.findAll().stream()
                .anyMatch(o -> !Arrays.equals(o.getId(), id) && Arrays.equals(o.getParentId(), t.getParentId())
                        && o.getName().equalsIgnoreCase(c.newSource().trim()));
        if (clash) {
            return "INVALID_CATEGORY_NAME_TAKEN";
        }
        t.setName(c.newSource());
        return "OK";
    }

    /** The SEO source fields of a category (everything translatable but the name). */
    static String categorySeoField(Category t, String field) {
        return switch (field) {
            case TranslationEntityType.SEO_TITLE -> t.getSeoTitle();
            case TranslationEntityType.SEO_DESCRIPTION -> t.getSeoDescription();
            case TranslationEntityType.H1 -> t.getH1();
            case TranslationEntityType.INTRO_TEXT -> t.getIntroText();
            default -> throw new IllegalArgumentException("not a category SEO field: " + field);
        };
    }

    private static void setCategorySeoField(Category t, String field, String value) {
        switch (field) {
            case TranslationEntityType.SEO_TITLE -> t.setSeoTitle(value);
            case TranslationEntityType.SEO_DESCRIPTION -> t.setSeoDescription(value);
            case TranslationEntityType.H1 -> t.setH1(value);
            case TranslationEntityType.INTRO_TEXT -> t.setIntroText(value);
            default -> throw new IllegalArgumentException("not a category SEO field: " + field);
        }
    }
}
