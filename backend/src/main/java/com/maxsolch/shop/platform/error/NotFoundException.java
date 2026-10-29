package com.maxsolch.shop.platform.error;

/**
 * Maps to HTTP 404.
 *
 * @deprecated use {@link DomainException.NotFound} with an {@link ErrorCode}.
 */
@Deprecated(forRemoval = true)
public class NotFoundException extends DomainException.NotFound {
    public NotFoundException(String message) {
        super(message, null);
    }
}
