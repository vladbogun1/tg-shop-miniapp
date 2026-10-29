package com.maxsolch.shop.payment.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;

import java.util.Map;

/**
 * Errors of the payment module with a ready text (admin-facing Russian, or a customer text already taken from
 * {@code Messages}) and a stable code the apps branch on. One place instead of the deprecated
 * {@code BadRequestException}/{@code ConflictException}; same HTTP statuses, codes and bodies as before.
 */
public final class PaymentErrors {

    private PaymentErrors() {
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

    /** 409 with the generic code {@code CONFLICT} (what {@code new ConflictException(msg)} gave). */
    public static DomainException.Conflict conflict(String message) {
        return conflict(message, "CONFLICT");
    }

    public static DomainException.Conflict conflict(String message, String code) {
        return new DomainException.Conflict(message, code == null ? null : ErrorCode.of(code), Map.of());
    }
}
