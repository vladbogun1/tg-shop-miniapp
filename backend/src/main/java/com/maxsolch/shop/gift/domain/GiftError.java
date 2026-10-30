package com.maxsolch.shop.gift.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code gift} module's errors; the text of each is {@code error.gift.<NAME>} in the i18n bundles. */
public enum GiftError implements ErrorCode {

    LEVEL_NOT_FOUND,
    INVALID_PRODUCT_ID,
    EMPTY_REQUEST,
    CASE_TIER_REQUIRED,
    PRIZE_PRODUCT_REQUIRED,
    INVALID_PRODUCT,
    PRODUCT_NOT_FOUND_OR_HIDDEN,
    PRODUCT_ALREADY_IN_CASE,
    PRIZE_NOT_FOUND,
    TOO_MANY_PRIZES,
    INVALID_PRIZE_PRODUCT,
    DUPLICATE_PRIZE_PRODUCT,
    PRIZE_PRODUCT_NOT_FOUND,
    PERCENT_OUT_OF_RANGE,
    AMOUNT_OUT_OF_RANGE,
    DISCOUNT_REQUIRED,
    UNKNOWN_PRIZE_KIND,
    UNKNOWN_RARITY,
    CHANCE_OUT_OF_RANGE,
    GIFT_CASE_SWAP_UNAVAILABLE("GIFT_CASE_SWAP_UNAVAILABLE"),
    GIFT_CASE_NONE("GIFT_CASE_NONE"),
    CASE_HAS_NO_PRIZES,
    INVALID_ORDER_ID,
    ORDER_NOT_FOUND,
    BAD_DATE_FORMAT,
    INVALID_PERIOD,
    PERIOD_TOO_LONG,
    UNKNOWN_CASE_NAMED,
    OPENINGS_OUT_OF_RANGE,
    NO_DROPPABLE_PRIZE,
    UNKNOWN_CASE,
    THRESHOLD_RANGE,
    GUARANTEED_PERCENT_RANGE,
    GUARANTEED_MAX_RANGE,
    SWAP_PERCENT_RANGE,
    PROMO_DAYS_RANGE,
    LOW_MARGIN_PERCENT_RANGE;

    private final String code;

    GiftError() {
        this(null);
    }

    GiftError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
