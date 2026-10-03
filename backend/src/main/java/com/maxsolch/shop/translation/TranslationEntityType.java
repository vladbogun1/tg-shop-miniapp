package com.maxsolch.shop.translation;

import java.util.List;

/**
 * What a row of {@code content_translations} translates, and which of its fields may be translated.
 * The field names are the snake_case column names of the Russian source (see docs/CONTENT-I18N.md).
 */
public enum TranslationEntityType {
    PRODUCT(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION,
            TranslationEntityType.SEO_TITLE, TranslationEntityType.SEO_DESCRIPTION)),
    VARIANT(List.of(TranslationEntityType.NAME)),
    TAG(List.of(TranslationEntityType.NAME)),
    PAYMENT_OPTION(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION));

    public static final String TITLE = "title";
    public static final String DESCRIPTION = "description";
    public static final String SEO_TITLE = "seo_title";
    public static final String SEO_DESCRIPTION = "seo_description";
    public static final String NAME = "name";

    private final List<String> fields;

    TranslationEntityType(List<String> fields) {
        this.fields = fields;
    }

    public List<String> fields() {
        return fields;
    }

    public boolean allows(String field) {
        return field != null && fields.contains(field);
    }

    /** Case-insensitive parse; {@code null} for blank or unknown values. */
    public static TranslationEntityType parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
