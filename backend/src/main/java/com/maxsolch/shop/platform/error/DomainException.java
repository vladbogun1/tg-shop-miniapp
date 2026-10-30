package com.maxsolch.shop.platform.error;

import java.util.Map;

/**
 * The one way a business rule says "no". The type fixes the HTTP meaning ({@link Kind}), the {@link ErrorCode} the
 * reason (machine-readable code and the key of the text), and {@link ApiExceptionHandler} turns it into
 * {@code {message, code?}} in one place:
 *
 * <pre>{@code throw new DomainException.NotFound(OrderError.NOT_FOUND);
 * throw new DomainException.BadRequest(ReturnError.ITEM_QTY_EXCEEDED, title, left);}</pre>
 *
 * <p>The text is never written in code: it is looked up in the i18n bundles under {@link ErrorCode#messageKey()} with
 * the arguments, in the language of the request. Arguments reach the text through {@link java.text.MessageFormat}:
 * a number is formatted for the reader's locale, so pass {@code String.valueOf(n)} when the digits must stay plain.
 */
public abstract class DomainException extends RuntimeException {

    /** HTTP meaning of the error; the platform is the only place that turns it into a status code. */
    public enum Kind {
        BAD_REQUEST(400), UNAUTHORIZED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), TOO_MANY_REQUESTS(429), UNAVAILABLE(503);

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

    protected DomainException(Kind kind, ErrorCode errorCode, Object... args) {
        super(errorCode.messageKey());
        this.kind = kind;
        this.errorCode = errorCode;
        this.args = args == null ? new Object[0] : args.clone();
    }

    public Kind kind() {
        return kind;
    }

    public ErrorCode errorCode() {
        return errorCode;
    }

    /** The value of the {@code code} field of the reply, or null when the reason has none. */
    public String getCode() {
        return errorCode.code();
    }

    /** Arguments of the text. */
    public Object[] args() {
        return args.clone();
    }

    /** The Russian text, for logs and tests; a client gets the text in the language of its request. */
    @Override
    public String getMessage() {
        return ErrorTexts.russian(errorCode, args);
    }

    /** 400. */
    public static class BadRequest extends DomainException {
        public BadRequest(ErrorCode code, Object... args) {
            super(Kind.BAD_REQUEST, code, args);
        }
    }

    /** 401: not authenticated / bad credentials. */
    public static class Unauthorized extends DomainException {
        public Unauthorized(ErrorCode code, Object... args) {
            super(Kind.UNAUTHORIZED, code, args);
        }
    }

    /** 403: authenticated, but not allowed. */
    public static class Forbidden extends DomainException {
        public Forbidden(ErrorCode code, Object... args) {
            super(Kind.FORBIDDEN, code, args);
        }
    }

    /** 404: the thing asked for does not exist (or is not visible to this actor). */
    public static class NotFound extends DomainException {
        public NotFound(ErrorCode code, Object... args) {
            super(Kind.NOT_FOUND, code, args);
        }
    }

    /** 409: valid request, but the data changed under it; {@link #withDetails} fields are merged into the response body. */
    public static class Conflict extends DomainException {
        private Map<String, Object> details = Map.of();

        public Conflict(ErrorCode code, Object... args) {
            super(Kind.CONFLICT, code, args);
        }

        /** Adds fields to the error body (e.g. {@code count}); returns this, so it can be thrown in place. */
        public Conflict withDetails(Map<String, Object> extra) {
            this.details = extra == null ? Map.of() : extra;
            return this;
        }

        /** Extra fields for the error body; never null. */
        public Map<String, Object> getDetails() {
            return details;
        }
    }

    /** 503: something the request needs is switched off or not configured (a bot token, an integration). */
    public static class Unavailable extends DomainException {
        public Unavailable(ErrorCode code, Object... args) {
            super(Kind.UNAVAILABLE, code, args);
        }
    }

    /** 429: a business limit; {@code Retry-After} and {@code retryAfterSec} are set when the wait is known. */
    public static class TooManyRequests extends DomainException {
        private final long retryAfterSeconds;

        public TooManyRequests(ErrorCode code, long retryAfterSeconds, Object... args) {
            super(Kind.TOO_MANY_REQUESTS, code, args);
            this.retryAfterSeconds = retryAfterSeconds;
        }

        /** Seconds until the next request may pass; 0 = unknown. */
        public long getRetryAfterSeconds() {
            return retryAfterSeconds;
        }
    }
}
