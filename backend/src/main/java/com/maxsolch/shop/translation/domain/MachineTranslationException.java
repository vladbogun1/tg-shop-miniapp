package com.maxsolch.shop.translation.domain;

/** A call to the machine translator failed; {@link #kind} says whether a later run may succeed. */
public class MachineTranslationException extends Exception {

    public enum Kind {
        /** The monthly characters are spent: nothing more until the next period. */
        QUOTA,
        /** The key is wrong or revoked: nothing until the owner fixes the configuration. */
        AUTH,
        /** Network, timeout, 429/5xx: the next run tries again. */
        TEMPORARY,
        /** The answer could not be read. */
        BAD_ANSWER
    }

    private final Kind kind;

    public MachineTranslationException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public MachineTranslationException(Kind kind, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }
}
