package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;

/**
 * Errors of the order module with a ready text (admin-facing Russian, or a customer text already taken from
 * {@code Messages}) and an optional stable code the apps branch on. One place instead of the deprecated
 * {@code BadRequestException}; the text moves to the i18n bundles code by code later.
 */
public final class OrderErrors {

    private OrderErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message, (ErrorCode) null);
    }

    public static DomainException.BadRequest badRequest(String message, String code) {
        return new DomainException.BadRequest(message, code == null ? null : ErrorCode.of(code));
    }

    public static DomainException.NotFound notFound(String message) {
        return new DomainException.NotFound(message, (ErrorCode) null);
    }
}
