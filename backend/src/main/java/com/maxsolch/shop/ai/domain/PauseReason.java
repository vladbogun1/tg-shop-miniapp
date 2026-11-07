package com.maxsolch.shop.ai.domain;

/** Why a batch stands on «Пауза»; the screen turns each into a sentence. */
public enum PauseReason {
    LIMIT_DAY,
    LIMIT_MONTH,
    /** The server restarted under the batch. */
    RESTART,
    /** Three jobs in a row failed. */
    FAILURES,
    /** The search found nothing for several jobs in a row (the provider is blocked or down). */
    SEARCH_DOWN,
    /** A person pressed «Пауза». */
    MANUAL,
    /** The owner switched the AI or the feature off. */
    DISABLED
}
