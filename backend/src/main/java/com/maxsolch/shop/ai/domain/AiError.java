package com.maxsolch.shop.ai.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code ai} module's errors; the text of each is {@code error.ai.<NAME>} in the i18n bundles. */
public enum AiError implements ErrorCode {

    NOT_CONFIGURED("AI_NOT_CONFIGURED"),
    MONTH_LIMIT("AI_MONTH_LIMIT"),
    DAY_LIMIT("AI_DAY_LIMIT"),
    MODEL_FAILED("AI_FAILED"),
    JOB_NOT_FOUND,
    BUSY("AI_BUSY"),
    BAD_REQUEST("AI_BAD_REQUEST"),
    /** The owner switched the AI (or this feature) off. */
    DISABLED("AI_DISABLED"),
    /** The provider refused the key or the balance is empty. */
    KEY_REJECTED("AI_KEY_REJECTED"),
    /** There is already an active job for this object; the body of the reply carries it. */
    JOB_ACTIVE("AI_JOB_ACTIVE"),
    /** The admin stopped the job (an internal signal of the run, never shown as an error). */
    CANCELED("AI_CANCELED"),
    /** The job spent more than its ceiling. */
    JOB_CEILING("AI_JOB_CEILING"),
    /** The job ran longer than its deadline. */
    DEADLINE("AI_DEADLINE"),
    /** The server restarted under the job twice. */
    RESTARTED("AI_RESTARTED"),
    BAD_STATE("AI_BAD_STATE"),
    /** One strengthened retry per job; further ones are for the owner. */
    RETRY_LIMIT("AI_RETRY_LIMIT"),
    /** The prompt of the job is gone (kept 60 days). */
    PROMPT_GONE("AI_PROMPT_GONE");

    private final String code;

    AiError() {
        this(null);
    }

    AiError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
