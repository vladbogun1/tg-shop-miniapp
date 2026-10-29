package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 400, optionally with a stable code the apps can branch on.
 *
 * @deprecated use {@link DomainException.BadRequest} with an {@link ErrorCode}; kept so old code keeps compiling.
 */
@Deprecated(forRemoval = true)
public class BadRequestException extends DomainException.BadRequest {

    public BadRequestException(String message) {
        this(message, null);
    }

    public BadRequestException(String message, String code) {
        super(message, code == null ? null : ErrorCode.of(code));
    }
}
