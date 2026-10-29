package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 401 (bad credentials / not authenticated).
 *
 * @deprecated use {@link DomainException.Unauthorized} with an {@link ErrorCode}.
 */
@Deprecated(forRemoval = true)
public class UnauthorizedException extends DomainException.Unauthorized {
    public UnauthorizedException(String message) {
        super(message, null);
    }
}
