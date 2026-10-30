package com.maxsolch.shop.catalog.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;

import java.util.Map;

/**
 * Errors of the catalog module with a ready (admin-facing) text. One place instead of the deprecated
 * {@code BadRequestException}/{@code NotFoundException}/{@code ConflictException}; same HTTP status and body as before.
 */
public final class CatalogErrors {

    private static final String GENERIC_CONFLICT = "CONFLICT";

    private CatalogErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message);
    }

    public static DomainException.BadRequest badRequest(String message, String code) {
        return new DomainException.BadRequest(message, code == null ? null : ErrorCode.of(code));
    }

    public static DomainException.NotFound notFound(String message) {
        return new DomainException.NotFound(message);
    }

    /** 409 with the generic CONFLICT code the admin apps already know. */
    public static DomainException.Conflict conflict(String message) {
        return conflict(message, GENERIC_CONFLICT);
    }

    public static DomainException.Conflict conflict(String message, String code) {
        return conflict(message, code, Map.of());
    }

    public static DomainException.Conflict conflict(String message, String code, Map<String, Object> details) {
        return new DomainException.Conflict(message, code == null ? null : ErrorCode.of(code), details);
    }
}
