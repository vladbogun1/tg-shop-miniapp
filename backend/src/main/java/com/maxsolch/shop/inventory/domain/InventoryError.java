package com.maxsolch.shop.inventory.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code inventory} module's errors; the text of each is {@code error.inventory.<NAME>} in the i18n bundles. */
public enum InventoryError implements ErrorCode {

    STOCK_REASON_REQUIRED("STOCK_REASON_REQUIRED"),
    STOCK_REASON_REQUIRED_OTHER("STOCK_REASON_REQUIRED"),
    OUT_OF_STOCK,
    PRODUCT_DELETED,
    WRITE_OFF_NOT_FOUND;

    private final String code;

    InventoryError() {
        this(null);
    }

    InventoryError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
