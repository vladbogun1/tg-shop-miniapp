package com.maxsolch.shop.platform.error;

import java.util.Map;

/**
 * The one way a business rule says "no". The type fixes the HTTP meaning ({@link Kind}), the {@link ErrorCode}
 * the machine-readable reason, and {@link ApiExceptionHandler} turns it into {@code {message, code?}} in one place.
 *
 * <p>Two ways to give the text:
 * <ul>
 *   <li>{@code new DomainException.NotFound(OrderError.NOT_FOUND, id)} — the text is looked up in the i18n bundles
 *       under {@code error.<code>} with the arguments, in the language of the request (the target way);</li>
 *   <li>{@code new DomainException.BadRequest("готовый текст", OrderError.X)} — a ready text (admin-only messages,
 *       code that has not been moved to the bundles yet).</li>
 * </ul>
 * The old {@code BadRequestException} and friends are now subtypes of these and are deprecated.
 */
public abstract class DomainException extends RuntimeException {

    /** HTTP meaning of the error; the platform is the only place that turns it into a status code. */
    public enum Kind {
        BAD_REQUEST(400), UNAUTHORIZED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), TOO_MANY_REQUESTS(429);

        private final int httpStatus;

        Kind(int httpStatus) {
            this.httpStatus = httpStatus;
        }

        public int httpStatus() {
            return httpStatus;
        }
    }

    private final Kind kind;
    private final ErrorCode errorCode;
    private final Object[] args;
    private final boolean fromCatalog;

    /** Text comes from the i18n bundles by code. */
    protected DomainException(Kind kind, ErrorCode errorCode, Object... args) {
        super("error." + errorCode.code());
        this.kind = kind;
        this.errorCode = errorCode;
        this.args = args == null ? new Object[0] : args;
        this.fromCatalog = true;
    }

    /** Text is given ready; the code may be absent. */
    protected DomainException(Kind kind, String message, ErrorCode errorCode) {
        super(message);
        this.kind = kind;
        this.errorCode = errorCode;
        this.args = new Object[0];
        this.fromCatalog = false;
    }

    public Kind kind() {
        return kind;
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    /** Stable identifier of the reason, or null when the message is the whole story. */
    public String getCode() {
        return errorCode == null ? null : errorCode.code();
    }

    /** Arguments of the i18n message; empty for a ready text. */
    public Object[] args() {
        return args.clone();
    }

    /** True when the text must be looked up by code; false when {@link #getMessage()} is already the text. */
    public boolean isFromCatalog() {
        return fromCatalog;
    }

    /** 400. */
    public static class BadRequest extends DomainException {
        public BadRequest(ErrorCode code, Object... args) {
            super(Kind.BAD_REQUEST, code, args);
        }

        public BadRequest(String message, ErrorCode code) {
            super(Kind.BAD_REQUEST, message, code);
        }
    }

    /** 401: not authenticated / bad credentials. */
    public static class Unauthorized extends DomainException {
        public Unauthorized(ErrorCode code, Object... args) {
            super(Kind.UNAUTHORIZED, code, args);
        }

        public Unauthorized(String message, ErrorCode code) {
            super(Kind.UNAUTHORIZED, message, code);
        }
    }

    /** 403: authenticated, but not allowed. */
    public static class Forbidden extends DomainException {
        public Forbidden(ErrorCode code, Object... args) {
            super(Kind.FORBIDDEN, code, args);
        }

        public Forbidden(String message, ErrorCode code) {
            super(Kind.FORBIDDEN, message, code);
        }
    }

    /** 404: the thing asked for does not exist (or is not visible to this actor). */
    public static class NotFound extends DomainException {
        public NotFound(ErrorCode code, Object... args) {
            super(Kind.NOT_FOUND, code, args);
        }

        public NotFound(String message, ErrorCode code) {
            super(Kind.NOT_FOUND, message, code);
        }
    }

    /** 409: valid request, but the data changed under it; {@code details} are merged into the response body. */
    public static class Conflict extends DomainException {
        private final Map<String, Object> details;

        public Conflict(ErrorCode code, Object... args) {
            super(Kind.CONFLICT, code, args);
            this.details = Map.of();
        }

        public Conflict(String message, ErrorCode code, Map<String, Object> details) {
            super(Kind.CONFLICT, message, code);
            this.details = details == null ? Map.of() : details;
        }

        /** Extra fields for the error body (e.g. {@code count}); never null. */
        public Map<String, Object> getDetails() {
            return details;
        }
    }

    /** 429: a business limit; {@code Retry-After} and {@code retryAfterSec} are set when the wait is known. */
    public static class TooManyRequests extends DomainException {
        private final long retryAfterSeconds;

        public TooManyRequests(ErrorCode code, long retryAfterSeconds, Object... args) {
            super(Kind.TOO_MANY_REQUESTS, code, args);
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public TooManyRequests(String message, ErrorCode code, long retryAfterSeconds) {
            super(Kind.TOO_MANY_REQUESTS, message, code);
            this.retryAfterSeconds = retryAfterSeconds;
        }

        /** Seconds until the next request may pass; 0 = unknown. */
        public long getRetryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
