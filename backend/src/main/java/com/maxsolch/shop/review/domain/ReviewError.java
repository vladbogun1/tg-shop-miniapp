package com.maxsolch.shop.review.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code review} module's errors; the text of each is {@code error.review.<NAME>} in the i18n bundles. */
public enum ReviewError implements ErrorCode {

    REPLY_TOO_LONG,
    REVIEW_NOT_FOUND,
    UNKNOWN_STATUS,
    PRODUCT_NOT_FOUND,
    REVIEWS_DISABLED,
    NOT_REVIEWABLE,
    ALREADY_REVIEWED,
    NOT_EDITABLE,
    NOT_YOUR_PRODUCT,
    TOO_MANY_PER_DAY,
    RATING_OUT_OF_RANGE,
    NOT_DELIVERED,
    TEXT_TOO_SHORT,
    TEXT_TOO_LONG;

    private final String code;

    ReviewError() {
        this(null);
    }

    ReviewError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
