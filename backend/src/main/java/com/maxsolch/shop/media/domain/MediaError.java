package com.maxsolch.shop.media.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code media} module's errors; the text of each is {@code error.media.<NAME>} in the i18n bundles. */
public enum MediaError implements ErrorCode {

    MEDIA_FORBIDDEN,
    LINK_EXPIRED,
    FILE_NOT_FOUND,
    FILE_TOO_BIG,
    BAD_FILE_TYPE,
    NO_FILE,
    BAD_EXTENSION;

    private final String code;

    MediaError() {
        this(null);
    }

    MediaError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
