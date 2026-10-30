package com.maxsolch.shop.analytics.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code analytics} module's errors; the text of each is {@code error.analytics.<NAME>} in the i18n bundles. */
public enum AnalyticsError implements ErrorCode {

    CUSTOM_PERIOD_DATES_REQUIRED,
    CUSTOM_PERIOD_TOO_LONG;

    private final String code;

    AnalyticsError() {
        this(null);
    }

    AnalyticsError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
