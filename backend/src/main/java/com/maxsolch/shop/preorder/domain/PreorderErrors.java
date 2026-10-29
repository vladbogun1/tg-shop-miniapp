package com.maxsolch.shop.preorder.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;

/**
 * Errors of the pre-order module: a ready text (admin-facing Russian, or a customer text already taken from
 * {@code Messages}) with an optional stable code. One place instead of the deprecated
 * {@code BadRequestException}/{@code NotFoundException}; statuses and bodies are the same.
 */
public final class PreorderErrors {

    private PreorderErrors() {
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
