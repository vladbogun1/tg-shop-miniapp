package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 403.
 *
 * @deprecated use {@link DomainException.Forbidden} with an {@link ErrorCode}.
 */
@Deprecated(forRemoval = true)
public class ForbiddenException extends DomainException.Forbidden {
    public ForbiddenException(String message) {
        super(message, null);
    }
}
