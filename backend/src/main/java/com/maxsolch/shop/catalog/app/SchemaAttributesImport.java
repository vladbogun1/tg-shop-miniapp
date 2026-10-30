package com.maxsolch.shop.catalog.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.SpecAttribute;
import com.maxsolch.shop.catalog.domain.SpecOption;
import com.maxsolch.shop.catalog.domain.SpecType;
import com.maxsolch.shop.catalog.infra.SpecAttributeRepository;
import com.maxsolch.shop.catalog.infra.SpecOptionRepository;
import com.maxsolch.shop.platform.error.DomainException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.KEY;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.VALUE;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.bucketsJson;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.cut;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.firstNonNull;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.intOrNull;
import static com.maxsolch.shop.catalog.app.CatalogSchemaImporter.text;

/**
 * The attributes-and-options step of {@link CatalogSchemaImporter}: upserts the attributes of one category (or the
 * global ones) by key and the options of ENUM / MULTI attributes by value. Runs inside the importer's transaction.
 */
final class SchemaAttributesImport {

    private final SpecAttributeRepository attributeRepository;
    private final SpecOptionRepository optionRepository;

    SchemaAttributesImport(SpecAttributeRepository attributeRepository, SpecOptionRepository optionRepository) {
        this.attributeRepository = attributeRepository;
        this.optionRepository = optionRepository;
    }

    void importAttributes(byte[] categoryId, JsonNode attrs, CatalogSchemaImporter.Counters n) {
        if (!attrs.isArray()) {
            return;
        }
        Map<String, SpecAttribute> existing = new HashMap<>();
        for (SpecAttribute a : attributeRepository.findAll()) {
            if (Arrays.equals(a.getCategoryId(), categoryId)) {
                existing.put(a.getKey(), a);
            }
        }
        for (JsonNode j : attrs) {
            String key = text(j, "key");
            if (key == null || !KEY.matcher(key).matches()) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_BAD_ATTRIBUTE_KEY, key);
            }
            SpecType type = SpecType.parse(text(j, "type"));
            if (type == null) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_UNKNOWN_ATTRIBUTE_TYPE, key, String.valueOf(text(j, "type")));
            }
            SpecAttribute a = existing.get(key);
            if (a == null) {
                a = new SpecAttribute();
                a.setCategoryId(categoryId);
                a.setKey(key);
                n.attrCreated++;
            } else {
                n.attrUpdated++;
            }
            fill(a, j, key, type);
            a = attributeRepository.save(a);
            existing.put(key, a);
            if (type == SpecType.ENUM || type == SpecType.MULTI) {
                importOptions(a, j.path("options"), n);
            }
        }
    }

    /** Copies labels, unit, flags, sort, buckets and hint of one attribute from the JSON. */
    private static void fill(SpecAttribute a, JsonNode j, String key, SpecType type) {
        String ru = firstNonNull(text(j, "label_ru"), a.getLabelRu(), key);
        a.setLabelRu(cut(ru, 96));
        a.setLabelUk(cut(firstNonNull(text(j, "label_uk"), a.getLabelUk(), ru), 96));
        a.setLabelEn(cut(firstNonNull(text(j, "label_en"), a.getLabelEn(), ru), 96));
        a.setType(type);
        JsonNode unit = j.path("unit");
        if (unit.isObject()) {
            a.setUnitRu(cut(text(unit, "ru"), 24));
            a.setUnitUk(cut(text(unit, "uk"), 24));
            a.setUnitEn(cut(text(unit, "en"), 24));
        } else if (unit.isTextual()) {
            a.setUnitRu(cut(unit.asText(), 24));
            a.setUnitUk(cut(unit.asText(), 24));
            a.setUnitEn(cut(unit.asText(), 24));
        } else {
            a.setUnitRu(null);
            a.setUnitUk(null);
            a.setUnitEn(null);
        }
        a.setRange(type == SpecType.NUMBER && j.path("range").asBoolean(false));
        String group = firstNonNull(text(j, "group"), a.getGroupKey(), "main");
        a.setGroupKey(cut(group, 32));
        a.setFilterable(j.path("filterable").asBoolean(false));
        a.setComparable(j.path("comparable").asBoolean(false));
        a.setRequired(j.has("required_for_ready") ? j.path("required_for_ready").asBoolean(false)
                : j.path("required").asBoolean(false));
        a.setHighlight(j.path("highlight").asBoolean(false));
        Integer sort = intOrNull(j, "sort");
        a.setSortOrder(sort != null ? sort : a.getSortOrder());
        a.setBucketsJson(type == SpecType.NUMBER ? bucketsJson(j.path("facet")) : null);
        String hint = firstNonNull(text(j, "hint_ru"), text(j, "hint"), null);
        a.setHint(hint);
    }

    private void importOptions(SpecAttribute a, JsonNode options, CatalogSchemaImporter.Counters n) {
        Map<String, SpecOption> existing = new HashMap<>();
        int maxSort = 0;
        for (SpecOption o : optionRepository.findByAttribute(a.getId())) {
            existing.put(o.getValue(), o);
            maxSort = Math.max(maxSort, o.getSortOrder());
        }
        int i = 0;
        for (JsonNode j : options) {
            i++;
            String value = text(j, "value");
            if (value == null || !VALUE.matcher(value).matches()) {
                throw new DomainException.BadRequest(CatalogError.IMPORT_BAD_OPTION_VALUE, a.getKey(), value);
            }
            SpecOption o = existing.get(value);
            if (o == null) {
                o = new SpecOption();
                o.setAttributeId(a.getId());
                o.setValue(value);
                n.optCreated++;
            } else {
                n.optUpdated++;
            }
            String ru = firstNonNull(text(j, "label_ru"), o.getLabelRu(), value);
            o.setLabelRu(cut(ru, 96));
            o.setLabelUk(cut(firstNonNull(text(j, "label_uk"), o.getLabelUk(), ru), 96));
            o.setLabelEn(cut(firstNonNull(text(j, "label_en"), o.getLabelEn(), ru), 96));
            List<String> aliases = new ArrayList<>();
            for (JsonNode al : j.path("aliases")) {
                aliases.add(al.asText(""));
            }
            if (j.has("aliases")) {
                o.setAliasList(aliases);
            }
            Integer sort = intOrNull(j, "sort");
            o.setSortOrder(sort != null ? sort : i * 10);
            optionRepository.save(o);
            existing.put(value, o);
        }
    }

    /** Flushes what the step wrote. */
    void flush() {
        attributeRepository.flush();
        optionRepository.flush();
    }
}
