package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.platform.error.DomainException;

import java.util.List;

/**
 * A Nova Poshta call failed. The text is ready for an admin (NP's own first error, or ours); {@link #codes()} are
 * NP's {@code errorCodes}. {@link #isUnavailable()} = NP did not answer at all (HTTP 503 to our client);
 * {@link #isUncertain()} = a write got no answer and NP may still have done it.
 */
public class NovaPoshtaException extends DomainException {

    private final transient List<String> codes;
    private final boolean unavailable;
    private final boolean uncertain;
    private final String reason;

    private NovaPoshtaException(Kind kind, DeliveryError code, String reason, List<String> codes,
                                boolean unavailable, boolean uncertain) {
        super(kind, code, reason);
        this.reason = reason;
        this.codes = codes == null ? List.of() : List.copyOf(codes);
        this.unavailable = unavailable;
        this.uncertain = uncertain;
    }

    /** NP answered «no» about this request (or we refused before asking). */
    public static NovaPoshtaException rejected(String reason) {
        return rejected(reason, List.of());
    }

    public static NovaPoshtaException rejected(String reason, List<String> codes) {
        return new NovaPoshtaException(Kind.BAD_REQUEST, DeliveryError.NP_ERROR, reason, codes, false, false);
    }

    /** NP did not answer (timeout, 5xx, throttled). */
    public static NovaPoshtaException unavailable(String reason) {
        return new NovaPoshtaException(Kind.UNAVAILABLE, DeliveryError.NP_UNAVAILABLE, reason, List.of(), true, false);
    }

    /** A write without an answer: NP may have carried it out. */
    public static NovaPoshtaException uncertain(String reason) {
        return new NovaPoshtaException(Kind.UNAVAILABLE, DeliveryError.NP_UNAVAILABLE, reason, List.of(), true, true);
    }

    /** The plain reason without the bundle's frame, for stored notes (poll_error, sync_error). */
    public String reason() {
        return reason;
    }

    public List<String> codes() {
        return codes;
    }

    public boolean isUnavailable() {
        return unavailable;
    }

    public boolean isUncertain() {
        return uncertain;
    }
}
