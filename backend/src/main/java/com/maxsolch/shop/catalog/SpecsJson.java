package com.maxsolch.shop.catalog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** (De)serialization of the JSON columns of the catalog (products.specs, card_meta, buckets). */
public final class SpecsJson {

    public static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {
    };
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() {
    };

    private SpecsJson() {
    }

    /** Never null; a broken value reads as empty (it is rewritten on the next save). */
    public static Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> m = MAPPER.readValue(json, MAP);
            return m == null ? new LinkedHashMap<>() : m;
        } catch (JsonProcessingException e) {
            return new LinkedHashMap<>();
        }
    }

    public static List<Map<String, Object>> readList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> l = MAPPER.readValue(json, LIST);
            return l == null ? List.of() : l;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    /** {@code null} for null/empty (the column stays NULL). */
    public static String write(Object value) {
        if (value == null || (value instanceof Map<?, ?> m && m.isEmpty())
                || (value instanceof List<?> l && l.isEmpty())) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("not serializable: " + e.getMessage(), e);
        }
    }
}
