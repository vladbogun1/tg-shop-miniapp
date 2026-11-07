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
    PROMPT_GONE("AI_PROMPT_GONE"),
    /** The object of a task (a product) is gone or never existed. */
    SUBJECT_NOT_FOUND("AI_SUBJECT_NOT_FOUND"),
    /** An admin without the finance right stops only the tasks he started himself. */
    NOT_YOUR_JOB("AI_NOT_YOUR_JOB"),
    /** More products than the batch maximum, or none. */
    BATCH_SIZE("AI_BATCH_SIZE"),
    BATCH_NOT_FOUND("AI_BATCH_NOT_FOUND"),
    /** The owner switched «Пакеты» off. */
    BATCHES_OFF("AI_BATCHES_OFF"),
    APPLY_NOT_FOUND("AI_APPLY_NOT_FOUND"),
    /** The 24 hours of the undo are over, or it was undone already. */
    UNDO_CLOSED("AI_UNDO_CLOSED"),
    /** The result is not eligible for the safe acceptance (no search, no source, already decided). */
    NOT_SAFE("AI_NOT_SAFE"),
    /** A file that is not a JPEG, PNG, WEBP or PDF (read from its bytes, not from its name). */
    FILE_TYPE("AI_FILE_TYPE"),
    /** A file over 10 MB. */
    FILE_TOO_BIG("AI_FILE_TOO_BIG"),
    /** A PDF with more than 10 pages. */
    PDF_PAGES("AI_PDF_PAGES"),
    /** A file that cannot be read (broken, password-protected, absurd size). */
    FILE_BROKEN("AI_FILE_BROKEN"),
    /** More than 10 pictures for one task. */
    FILES_LIMIT("AI_FILES_LIMIT"),
    /** An upload that would take the waiting pictures over 10: how many wait and how many the file gives. */
    FILES_OVER("AI_FILES_OVER"),
    FILE_NOT_FOUND("AI_FILE_NOT_FOUND"),
    /** The files of the task were deleted (kept 7 days) or none were attached. */
    FILES_GONE("AI_FILES_GONE");

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
