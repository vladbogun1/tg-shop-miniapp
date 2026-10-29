package com.maxsolch.shop.translation.domain;

import com.maxsolch.shop.platform.error.DomainException;

/** Errors of the translation module (admin-facing text; same HTTP status and body as the old exceptions). */
public final class TranslationErrors {

    private TranslationErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message);
    }
}
