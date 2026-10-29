package com.maxsolch.shop.procurement.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;

/**
 * Errors of the procurement module with a ready admin-facing text and an optional stable code the admin app
 * branches on. One place instead of the deprecated {@code BadRequestException}/{@code NotFoundException};
 * statuses and bodies are the same.
 */
public final class ProcurementErrors {

    private ProcurementErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message);
    }

    public static DomainException.BadRequest badRequest(String message, String code) {
        return new DomainException.BadRequest(message, ErrorCode.of(code));
    }

    public static DomainException.NotFound notFound(String message) {
        return new DomainException.NotFound(message);
    }
}
