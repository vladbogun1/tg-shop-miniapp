package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.platform.error.DomainException;

/** Short-hands for the delivery module's errors whose text is ready for the admin (Russian, from the branch). */
final class NpErrors {

    private NpErrors() {
    }

    /** 400 with this text ({@code error.delivery.NP_BAD_REQUEST={0}}). */
    static DomainException bad(String text) {
        return new DomainException.BadRequest(DeliveryError.NP_BAD_REQUEST, text);
    }

    static DomainException keyMissing() {
        return new DomainException.BadRequest(DeliveryError.NP_KEY_MISSING);
    }

    static DomainException senderMissing() {
        return new DomainException.BadRequest(DeliveryError.NP_SENDER_MISSING);
    }

    static DomainException orderNotFound() {
        return new DomainException.NotFound(DeliveryError.NP_ORDER_NOT_FOUND);
    }
}
