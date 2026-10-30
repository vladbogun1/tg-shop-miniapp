package com.maxsolch.shop.media.domain;

import com.maxsolch.shop.platform.error.DomainException;

/** Errors of the media module with a ready (localized) text; same HTTP status and body as before. */
public final class MediaErrors {

    private MediaErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message);
    }

    public static DomainException.NotFound notFound(String message) {
        return new DomainException.NotFound(message);
    }

    public static DomainException.Forbidden forbidden(String message) {
        return new DomainException.Forbidden(message);
    }
}
