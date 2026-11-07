package com.maxsolch.shop.ai.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code ai} module's errors; the text of each is {@code error.ai.<NAME>} in the i18n bundles. */
public enum AiError implements ErrorCode {

    NOT_CONFIGURED("AI_NOT_CONFIGURED"),
    MONTH_LIMIT("AI_MONTH_LIMIT"),
    MODEL_FAILED("AI_FAILED"),
    JOB_NOT_FOUND,
    BUSY("AI_BUSY"),
    BAD_REQUEST("AI_BAD_REQUEST");

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
