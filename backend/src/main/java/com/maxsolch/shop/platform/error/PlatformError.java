package com.maxsolch.shop.platform.error;

/** Reasons of the {@code platform} module's errors; the text of each is {@code error.platform.<NAME>} in the i18n bundles. */
public enum PlatformError implements ErrorCode {

    DATE_FORMAT_INVALID,
    SUPER_ADMIN_ONLY,
    FINANCE_ACCESS_DENIED,
    SETTING_UNKNOWN("SETTING_UNKNOWN"),
    NOT_AUTHENTICATED,
    INITDATA_EMPTY,
    INITDATA_NO_HASH,
    BOT_TOKEN_MISSING,
    INITDATA_HASH_MISMATCH,
    INITDATA_REUSED,
    INITDATA_NO_USER,
    INITDATA_NO_AUTH_DATE,
    INITDATA_AUTH_DATE_NAN,
    INITDATA_EXPIRED,
    INITDATA_FROM_FUTURE,
    INITDATA_USER_NO_ID,
    INITDATA_USER_UNPARSABLE,
    INITDATA_REPEATED_KEY,
    HMAC_FAILED,
    SETTING_NOT_INTEGER("SETTING_INVALID"),
    SETTING_OUT_OF_RANGE("SETTING_INVALID"),
    SETTING_NOT_BOOLEAN("SETTING_INVALID"),
    SETTING_TEXT_REQUIRED("SETTING_INVALID"),
    SETTING_SINGLE_LINE("SETTING_INVALID"),
    SETTING_TOO_LONG("SETTING_INVALID"),
    SETTING_BAD_CODE_LIST("SETTING_INVALID"),
    SETTING_NOT_IN_LIST("SETTING_INVALID"),
    SETTING_ZERO_TO_TEN("SETTING_INVALID"),
    SETTING_NOT_DECIMAL("SETTING_INVALID");

    private final String code;

    PlatformError() {
        this(null);
    }

    PlatformError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
