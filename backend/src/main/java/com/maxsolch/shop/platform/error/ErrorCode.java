package com.maxsolch.shop.platform.error;

/**
 * Stable machine-readable reason of a {@link DomainException}; the apps branch on it, so a code is never renamed.
 *
 * <p>Each module declares its own {@code enum XxxError implements ErrorCode}; the platform knows none of them.
 * The text shown to a person is looked up by the code in the i18n bundles under {@code error.<code>}
 * (see {@link DomainException}), so changing the wording never touches the code.
 */
public interface ErrorCode {

    /** The value that goes into the {@code code} field of the JSON error body, e.g. {@code ORDER_COOLDOWN}. */
    String code();

    /** Wraps a bare string for the legacy exceptions that still carry the code as text. */
    static ErrorCode of(String code) {
        if (code == null) {
            throw new IllegalArgumentException("code");
        }
        return new Raw(code);
    }

    /** Legacy code as a value; modules should use their own enum instead. */
    record Raw(String code) implements ErrorCode {
    }
}
