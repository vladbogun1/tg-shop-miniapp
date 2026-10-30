package com.maxsolch.shop.translation.app;

/** Size limits of one translation request and one stored text. */
public final class TranslationLimits {

    public static final int MAX_TEXT_CHARS = 20_000;
    /** {@code TEXT} holds 65 535 bytes; 20 000 emoji would not fit. */
    static final int MAX_TEXT_BYTES = 65_535;
    public static final int MAX_ITEMS = 20_000;
    /** Fields sharing one proofread source (a description reused by many products). */
    static final int MAX_FIX_ITEMS = 2_000;
    /** Rejected keys returned to the caller; the counters stay exact beyond that. */
    static final int MAX_REJECTED_LISTED = 2_000;

    private TranslationLimits() {
    }
}
