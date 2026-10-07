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
    /** Name + the SEO of the category page (V36). */
    TAG(List.of(TranslationEntityType.NAME, TranslationEntityType.SEO_TITLE, TranslationEntityType.SEO_DESCRIPTION,
            TranslationEntityType.H1, TranslationEntityType.INTRO_TEXT)),
    PAYMENT_OPTION(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION)),
    /**
     * A chat reply template (⚡ in the order chat, V50). Its numeric id is stored in the low 8 bytes of
     * {@code entity_id} — see {@link com.maxsolch.shop.domain.ReplyTemplate#translationId(long)}.
     */
    REPLY_TEMPLATE(List.of(TranslationEntityType.BODY));
    // PAYMENT_REQUISITES (V29) went with the manual card transfer: rows deleted in V39, the ENUM value
    // itself in V48.

    public static final String TITLE = "title";
    public static final String DESCRIPTION = "description";
    public static final String SEO_TITLE = "seo_title";
    public static final String SEO_DESCRIPTION = "seo_description";
    public static final String NAME = "name";
    public static final String H1 = "h1";
    public static final String INTRO_TEXT = "intro_text";
    /** Text of a reply template (Russian source: {@code reply_templates.body_ru}). */
    public static final String BODY = "body";

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
