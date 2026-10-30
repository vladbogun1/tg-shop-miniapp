package com.maxsolch.shop.translation.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code translation} module's errors; the text of each is {@code error.translation.<NAME>} in the i18n bundles. */
public enum TranslationError implements ErrorCode {

    FIELD_NEEDS_ENTITY,
    ENTITY_ID_NEEDS_TYPE,
    INVALID_ENTITY_ID,
    FIELD_NOT_TRANSLATABLE,
    EMPTY_BODY,
    TOO_MANY_ITEMS,
    INVALID_ORIGIN,
    INVALID_STATUS,
    INVALID_LOCALE,
    INVALID_ENTITY_TYPE,
    ITEMS_REQUIRED,
    SOURCE_BLANK,
    TRANSLATION_TOO_LONG;

    private final String code;

    TranslationError() {
        this(null);
    }

    TranslationError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
