package com.maxsolch.shop.translation;

import java.util.List;

/**
 * What a row of {@code content_translations} translates, and which of its fields may be translated.
 * The field names are the snake_case column names of the Russian source (see docs/CONTENT-I18N.md).
 */
public enum TranslationEntityType {
    /** {@code condition_note} (V52) — reason of the markdown / state of a used item. */
    PRODUCT(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION,
            TranslationEntityType.SEO_TITLE, TranslationEntityType.SEO_DESCRIPTION,
            TranslationEntityType.CONDITION_NOTE)),
    VARIANT(List.of(TranslationEntityType.NAME)),
    /**
     * LEGACY (before V52 categories were tags). Rows stay in the table for a rollback and for the
     * SEO of the virtual «Уценка» page; nothing can be exported or imported for it any more.
     */
    TAG(List.of()),
    PAYMENT_OPTION(List.of(TranslationEntityType.TITLE, TranslationEntityType.DESCRIPTION)),
    /**
     * A chat reply template (⚡ in the order chat, V50). Its numeric id is stored in the low 8 bytes of
     * {@code entity_id} — see {@link com.maxsolch.shop.domain.ReplyTemplate#translationId(long)}.
     */
    REPLY_TEMPLATE(List.of(TranslationEntityType.BODY)),
    /** Category of the catalog tree (V52, rows copied from TAG): name + the SEO of its page. */
    CATEGORY(List.of(TranslationEntityType.NAME, TranslationEntityType.SEO_TITLE, TranslationEntityType.SEO_DESCRIPTION,
            TranslationEntityType.H1, TranslationEntityType.INTRO_TEXT)),
    /** Reserved (V52): brand names are not translated yet. */
    BRAND(List.of());
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
    public static final String CONDITION_NOTE = "condition_note";

    private final List<String> fields;

    TranslationEntityType(List<String> fields) {
        this.fields = fields;
    }

    public List<String> fields() {
        return fields;
    }

    /** Types the «Переводы» screen works with (legacy/reserved ones have no fields). */
    public boolean translatable() {
        return !fields.isEmpty();
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
