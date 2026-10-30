package com.maxsolch.shop.staff.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code staff} module's errors; the text of each is {@code error.staff.<NAME>} in the i18n bundles. */
public enum StaffError implements ErrorCode {

    NO_PASSWORD_LOGIN("NO_PASSWORD_LOGIN"),
    BAD_PASSWORD("BAD_PASSWORD"),
    TOTP_NOT_SET("TOTP_NOT_SET"),
    TOTP_SETUP_EXPIRED_RESET("TOTP_SETUP_EXPIRED"),
    BAD_CODE("BAD_CODE"),
    PASSWORD_TOO_SHORT("PASSWORD_TOO_SHORT"),
    PASSWORD_TOO_LONG("PASSWORD_TOO_LONG"),
    PASSWORD_SPACES("PASSWORD_SPACES"),
    PASSWORD_SAME("PASSWORD_SAME"),
    NOT_AUTHENTICATED,
    BAD_CREDENTIALS,
    NOT_AN_ADMIN,
    CODE_STEP_EXPIRED,
    TOTP_ALREADY_SET("TOTP_ALREADY_SET"),
    TOTP_SETUP_EXPIRED("TOTP_SETUP_EXPIRED"),
    WRONG_CODE,
    INVITE_STEP_EXPIRED("INVITE_STEP_EXPIRED"),
    INVITE_INVALID("INVITE_INVALID"),
    USERNAME_TAKEN("USERNAME_TAKEN"),
    INVITE_REVOKED("INVITE_REVOKED"),
    BAD_USERNAME("BAD_USERNAME"),
    LOGIN_LOCKED,
    BAD_TELEGRAM_ID("BAD_TELEGRAM_ID"),
    BLOCKED("BLOCKED"),
    HAS_LOGIN("HAS_LOGIN"),
    INVITE_NOT_FOUND,
    INVITE_CLOSED("INVITE_CLOSED"),
    INVITE_CLOSED_MISMATCH("INVITE_CLOSED"),
    BLOCKED_ADMIN("BLOCKED"),
    HAS_HISTORY("HAS_HISTORY"),
    LAST_SUPER_ADMIN("LAST_SUPER_ADMIN"),
    CODE_REQUIRED("CODE_REQUIRED"),
    ADMIN_NOT_FOUND,
    BAD_NAME("BAD_NAME"),
    BAD_ROLE("BAD_ROLE"),
    SELF("SELF"),
    INCIDENT_NOT_FOUND,
    OUTCOME_REQUIRED;

    private final String code;

    StaffError() {
        this(null);
    }

    StaffError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
