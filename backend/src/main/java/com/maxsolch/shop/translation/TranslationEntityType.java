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
    PAYMENT_OPTION(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION)),
    /**
     * The single shop requisites row (customer-facing note and transfer purpose). Its id is the
     * fixed {@link #REQUISITES_ID} — {@code payment_requisites} has an int key, not a UUID.
     */
    PAYMENT_REQUISITES(List.of(TranslationEntityType.NOTE, TranslationEntityType.PURPOSE));

    /** entity_id of the PAYMENT_REQUISITES rows (payment_requisites.id = 1). */
    public static final String REQUISITES_ID = "00000000-0000-0000-0000-000000000001";

    public static final String TITLE = "title";
    public static final String DESCRIPTION = "description";
    public static final String SEO_TITLE = "seo_title";
    public static final String SEO_DESCRIPTION = "seo_description";
    public static final String NAME = "name";
    public static final String NOTE = "note";
    public static final String PURPOSE = "purpose";

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
