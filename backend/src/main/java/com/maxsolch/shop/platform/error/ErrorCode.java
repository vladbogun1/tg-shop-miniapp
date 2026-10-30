package com.maxsolch.shop.platform.error;

/**
 * The reason of a {@link DomainException}: one constant of a module's {@code enum XxxError implements ErrorCode}.
 * There is no other way to make one (no strings, no records): the constant is the only place that knows the reason,
 * and the text a person reads lives in the i18n bundles under {@link #messageKey()}.
 *
 * <p>Two different things, both fixed by the constant:
 * <ul>
 *   <li>{@link #code()} - what the apps branch on (the {@code code} field of the JSON body). It is part of the API,
 *       never renamed, and may be absent: many reasons are just a sentence for the person.</li>
 *   <li>{@link #messageKey()} - where the sentence is; {@code error.<module>.<NAME>} in all four bundles
 *       ({@code ErrorCatalogTest} fails when a constant has no text in one of them).</li>
 * </ul>
 */
public interface ErrorCode {

    /** The enum constant name; unique inside its enum. */
    String name();

    /** The value of the {@code code} field of the JSON error body, or null when the reply carries only the text. */
    String code();

    /**
     * Bundle key of the text, derived from the enum: {@code OrderError.NOT_FOUND} is {@code error.order.NOT_FOUND}.
     * Use one enum per module (or per area of a big module): the class name is the key prefix.
     */
    default String messageKey() {
        String type = getClass().getSimpleName();
        String base = type.endsWith("Error") ? type.substring(0, type.length() - "Error".length()) : type;
        return "error." + Character.toLowerCase(base.charAt(0)) + base.substring(1) + "." + name();
    }
}
