package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code procurement} module's errors; the text of each is {@code error.procurement.<NAME>} in the i18n bundles. */
public enum ProcurementError implements ErrorCode {

    DOCUMENT_FILE_NOT_FOUND,
    BATCH_NOT_FOUND_BY_ID,
    EMPTY_REQUEST,
    BAD_CURRENCY("BAD_CURRENCY"),
    BAD_ITEM("BAD_ITEM"),
    BAD_PRICE("BAD_PRICE"),
    BAD_WEIGHT("BAD_WEIGHT"),
    EXPENSE_NOT_FOUND,
    DOCUMENT_NOT_FOUND,
    BAD_AMOUNT("BAD_AMOUNT"),
    BAD_KIND("BAD_KIND"),
    BAD_ITEM_UNNAMED("BAD_ITEM"),
    PRODUCT_NOT_FOUND,
    PRODUCT_REQUIRED,
    BAD_COST("BAD_COST"),
    NO_OLD_STOCK,
    BATCH_NOT_FOUND,
    BAD_ALLOCATION("BAD_ALLOCATION"),
    BAD_RATE("BAD_RATE"),
    NO_ITEMS("NO_ITEMS"),
    BATCH_CLOSED_ITEMS("BATCH_CLOSED"),
    BATCH_CLOSED("BATCH_CLOSED"),
    BAD_STATUS("BAD_STATUS"),
    BAD_QTY("BAD_QTY"),
    BAD_PRICE_NOT_POSITIVE("BAD_PRICE"),
    PRODUCT_GONE("PRODUCT_GONE"),
    VARIANT_GONE("VARIANT_GONE"),
    BAD_SUPPLIER("BAD_SUPPLIER"),
    BAD_ETA("BAD_ETA"),
    BAD_ETA_RANGE("BAD_ETA"),
    BAD_ETA_APPROX("BAD_ETA"),
    BAD_RATE_NOT_POSITIVE("BAD_RATE"),
    BAD_PRODUCT("BAD_PRODUCT"),
    BAD_VARIANT("BAD_VARIANT"),
    VARIANT_REQUIRED("VARIANT_REQUIRED"),
    DUPLICATE_LINE("DUPLICATE_LINE"),
    BAD_QTY_ORDERED("BAD_QTY"),
    BAD_HOLD("BAD_HOLD"),
    FIELD_REQUIRED,
    UNKNOWN_VALUE,
    BAD_NAME("BAD_NAME"),
    PRODUCT_ID_REQUIRED,
    INVALID_ID,
    NBU_UNAVAILABLE("NBU_UNAVAILABLE");

    private final String code;

    ProcurementError() {
        this(null);
    }

    ProcurementError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
