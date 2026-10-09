package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CatalogBrandDto;
import com.maxsolch.shop.catalog.CatalogDtos.CatalogCategoryDto;
import com.maxsolch.shop.catalog.CatalogDtos.CatalogSchemaDto;
import com.maxsolch.shop.catalog.CatalogDtos.ConditionDto;
import com.maxsolch.shop.catalog.CatalogDtos.FacetBucketDto;
import com.maxsolch.shop.catalog.CatalogDtos.SpecAttributeDto;
import com.maxsolch.shop.catalog.CatalogDtos.SpecGroupDto;
import com.maxsolch.shop.catalog.CatalogDtos.SpecOptionDto;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The catalog schema as the storefronts read it ({@code CatalogSchema} of shared/src/catalog.ts,
 * localized, cached per language) and as the admin reads it (all languages, in the
 * {@code schema-draft.json} format the import takes — so an export can be re-imported elsewhere).
 */
@Service
public class CatalogSchemaService {

    private static final String LANG_KEY = "T(com.maxsolch.shop.translation.ContentLocale).normalize(#lang)";

    private final CatalogDirectory directory;
    private final CatalogService catalogService;
    private final TranslationService translationService;

    public CatalogSchemaService(CatalogDirectory directory, CatalogService catalogService,
                                TranslationService translationService) {
        this.directory = directory;
        this.catalogService = catalogService;
        this.translationService = translationService;
    }

    // ------------------------------------------------------------------ storefront

    @Cacheable(value = "catalogSchema", key = "'public:' + " + LANG_KEY)
    public CatalogSchemaDto publicSchema(String lang) {
        String l = ContentLocale.normalize(lang);
        CatalogSnapshot s = directory.snapshot();
        TranslationService.Overlay overlay = translationService.overlay(l);

        Map<String, Long> catCounts = new HashMap<>();
        Map<String, Long> brandCounts = new HashMap<>();
        for (ProductDto p : catalogService.listActiveProducts(l)) {
            for (CatalogSnapshot.Cat c : s.path(p.categoryId())) {
                catCounts.merge(c.id(), 1L, Long::sum);
            }
            if (p.brandRef() != null) {
                brandCounts.merge(p.brandRef().id(), 1L, Long::sum);
            }
        }
        List<CatalogCategoryDto> categories = s.treeOrder().stream()
                .map(c -> new CatalogCategoryDto(c.id(), c.slug(),
                        overlay.text(TranslationEntityType.CATEGORY, c.id(), TranslationEntityType.NAME, c.name()),
                        c.parentId(), c.sortOrder(), c.showInMenu(), c.artKind(), catCounts.getOrDefault(c.id(), 0L)))
                .toList();
        List<CatalogBrandDto> brands = s.brands().stream()
                .filter(b -> brandCounts.getOrDefault(b.id(), 0L) > 0)
                .map(b -> new CatalogBrandDto(b.id(), b.slug(), b.name(), brandCounts.get(b.id()),
                        b.logoUrl(), b.logoMode()))
                .toList();
        List<SpecGroupDto> groups = s.groups().stream()
                .map(g -> new SpecGroupDto(g.key(), g.label(l), g.sort()))
                .toList();
        List<SpecAttributeDto> attributes = s.attributes().stream().map(a -> attribute(a, l)).toList();
        return new CatalogSchemaDto(categories, brands, groups, attributes, conditions(l));
    }

    static SpecAttributeDto attribute(CatalogSnapshot.Attr a, String lang) {
        boolean withOptions = a.type() == SpecType.ENUM || a.type() == SpecType.MULTI;
        List<SpecOptionDto> options = withOptions
                ? a.options().stream().map(o -> new SpecOptionDto(o.value(), o.label(lang), o.sort())).toList()
                : null;
        List<FacetBucketDto> buckets = a.type() == SpecType.NUMBER && a.buckets() != null
                ? a.buckets().stream().map(b -> new FacetBucketDto(b.id(), b.label(lang), b.min(), b.max())).toList()
                : null;
        String unit = a.unit(lang);
        return new SpecAttributeDto(a.id(), a.key(), a.label(lang), a.type().json(),
                unit == null || unit.isBlank() ? null : unit, a.range(), a.group(), a.filterable(), a.comparable(),
                a.required(), a.highlight(), a.sort(), a.categoryId(), options, buckets, a.hint());
    }

    static List<ConditionDto> conditions(String lang) {
        List<ConditionDto> out = new ArrayList<>();
        for (ProductCondition c : ProductCondition.values()) {
            out.add(new ConditionDto(c.name(), c.label(lang)));
        }
        return out;
    }

    // ------------------------------------------------------------------ admin export

    /** Whole schema in all languages, in the import format (plus ids and product counts). */
    @Transactional(readOnly = true)
    public Map<String, Object> adminSchema() {
        CatalogSnapshot s = directory.load();
        TranslationService.Overlay uk = translationService.overlay(ContentLocale.UK);
        TranslationService.Overlay en = translationService.overlay(ContentLocale.EN);
        Map<String, Long> counts = new HashMap<>();
        for (ProductDto p : catalogService.listActiveProducts(ContentLocale.RU)) {
            for (CatalogSnapshot.Cat c : s.path(p.categoryId())) {
                counts.merge(c.id(), 1L, Long::sum);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", 1);
        List<Map<String, Object>> groups = new ArrayList<>();
        for (CatalogSnapshot.Group g : s.groups()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", g.key());
            m.put("label_ru", g.labelRu());
            m.put("label_uk", g.labelUk());
            m.put("label_en", g.labelEn());
            m.put("sort", g.sort());
            groups.add(m);
        }
        out.put("groups", groups);
        out.put("global_attributes", s.attributes().stream().filter(a -> a.categoryId() == null)
                .map(CatalogSchemaService::exportAttribute).toList());
        List<Map<String, Object>> categories = new ArrayList<>();
        for (CatalogSnapshot.Cat c : s.treeOrder()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.id());
            m.put("slug", c.slug());
            m.put("name_ru", c.name());
            m.put("name_uk", uk.translationOrNull(TranslationEntityType.CATEGORY, c.id(), TranslationEntityType.NAME,
                    c.name()));
            m.put("name_en", en.translationOrNull(TranslationEntityType.CATEGORY, c.id(), TranslationEntityType.NAME,
                    c.name()));
            CatalogSnapshot.Cat parent = s.category(c.parentId());
            m.put("parent", parent == null ? null : parent.slug());
            m.put("old_tag_slugs", List.of());
            m.put("sort_order", c.sortOrder());
            m.put("show_in_menu", c.showInMenu());
            m.put("art_kind", c.artKind());
            m.put("product_count", counts.getOrDefault(c.id(), 0L));
            m.put("attributes", s.attributes().stream().filter(a -> c.id().equals(a.categoryId()))
                    .map(CatalogSchemaService::exportAttribute).toList());
            categories.add(m);
        }
        out.put("categories", categories);
        List<Map<String, Object>> conditions = new ArrayList<>();
        for (ProductCondition c : ProductCondition.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", c.name().toLowerCase(Locale.ROOT));
            m.put("label_ru", c.label(ContentLocale.RU));
            m.put("label_uk", c.label(ContentLocale.UK));
            m.put("label_en", c.label(ContentLocale.EN));
            conditions.add(m);
        }
        out.put("conditions", conditions);
        List<Map<String, Object>> brands = new ArrayList<>();
        for (CatalogSnapshot.BrandInfo b : s.brands()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.id());
            m.put("name", b.name());
            m.put("slug", b.slug());
            m.put("aliases", b.aliases());
            m.put("website", b.website());
            brands.add(m);
        }
        out.put("brands", brands);
        return out;
    }

    static Map<String, Object> exportAttribute(CatalogSnapshot.Attr a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", a.id());
        m.put("key", a.key());
        m.put("label_ru", a.labelRu());
        m.put("label_uk", a.labelUk());
        m.put("label_en", a.labelEn());
        m.put("type", a.type().json());
        if (a.unitRu() != null || a.unitUk() != null || a.unitEn() != null) {
            Map<String, Object> unit = new LinkedHashMap<>();
            unit.put("ru", a.unitRu());
            unit.put("uk", a.unitUk());
            unit.put("en", a.unitEn());
            m.put("unit", unit);
        } else {
            m.put("unit", null);
        }
        m.put("range", a.range());
        m.put("group", a.group());
        m.put("filterable", a.filterable());
        m.put("comparable", a.comparable());
        m.put("required_for_ready", a.required());
        m.put("highlight", a.highlight());
        m.put("sort", a.sort());
        if (a.buckets() != null && !a.buckets().isEmpty()) {
            List<Map<String, Object>> buckets = new ArrayList<>();
            for (CatalogSnapshot.Bucket b : a.buckets()) {
                Map<String, Object> bm = new LinkedHashMap<>();
                bm.put("id", b.id());
                bm.put("label_ru", b.labelRu());
                bm.put("label_uk", b.labelUk());
                bm.put("label_en", b.labelEn());
                bm.put("min", b.min());
                bm.put("max", b.max());
                buckets.add(bm);
            }
            m.put("facet", Map.of("style", "buckets", "buckets", buckets));
        } else {
            m.put("facet", null);
        }
        m.put("hint_ru", a.hint());
        if (a.type() == SpecType.ENUM || a.type() == SpecType.MULTI) {
            List<Map<String, Object>> options = new ArrayList<>();
            for (CatalogSnapshot.Option o : a.options()) {
                Map<String, Object> om = new LinkedHashMap<>();
                om.put("value", o.value());
                om.put("label_ru", o.labelRu());
                om.put("label_uk", o.labelUk());
                om.put("label_en", o.labelEn());
                om.put("aliases", o.aliases());
                om.put("sort", o.sort());
                options.add(om);
            }
            m.put("options", options);
        }
        return m;
    }
}
