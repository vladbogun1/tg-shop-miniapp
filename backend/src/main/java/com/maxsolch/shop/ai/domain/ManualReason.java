package com.maxsolch.shop.ai.domain;

/**
 * Why an admin did the work by hand (through ChatGPT) instead of the built-in AI: the line «вручную 12: лимит 3, сбой 4,
 * по выбору 5» of the metrics. Written into {@code ai_jobs.error_code} of the mark row of the manual way.
 */
public enum ManualReason {
    /** The admin preferred the manual way (the AI was available and worked). */
    CHOICE,
    /** A day or month limit was used up. */
    LIMIT,
    /** The built-in AI had just failed for this object (no data, unreadable answer, error). */
    FAILURE,
    /** The AI was not set up or the owner switched it off. */
    OFF
}
