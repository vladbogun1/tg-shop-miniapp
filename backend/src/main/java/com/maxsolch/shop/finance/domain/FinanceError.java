package com.maxsolch.shop.finance.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code finance} module's errors; the text of each is {@code error.finance.<NAME>} in the i18n bundles. */
public enum FinanceError implements ErrorCode {

    BATCH_NOT_FOUND,
    ORDER_NOT_FOUND;

    private final String code;

    FinanceError() {
        this(null);
    }

    FinanceError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
