package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/**
 * Reasons of the {@code delivery} module's errors; the text of each is {@code error.delivery.<NAME>} in the i18n
 * bundles. Nova Poshta's own answers come through {@link #NP_ERROR} with the text it gave (it is already a sentence
 * for the admin); everything we say ourselves is a constant here.
 */
public enum DeliveryError implements ErrorCode {

    /** A Nova Poshta call failed: {0} is the reason, ready to show. */
    NP_ERROR("NP_ERROR"),
    /** Nova Poshta did not answer (timeout, 5xx, «To many requests»): {0} says which call. */
    NP_UNAVAILABLE("NP_UNAVAILABLE"),
    /** Our own refusal before calling NP, as a ready sentence ({0}). */
    NP_REFUSED("NP_REFUSED"),
    /** The order has no waybill to act on. */
    NP_NO_SHIPMENT("NP_NO_SHIPMENT"),
    /** The order already has an active waybill: {0} its number. */
    NP_TTN_EXISTS("NP_TTN_EXISTS"),
    /** Another request is making this order's waybill right now. */
    NP_TTN_BUSY("NP_TTN_BUSY"),
    /** The waybill no longer matches its order: {0} why. */
    NP_TTN_STALE("NP_TTN_STALE"),
    /** Not a Nova Poshta order. */
    NP_NOT_NP_ORDER("NP_NOT_NP_ORDER"),
    /** The order was not found. */
    NP_ORDER_NOT_FOUND("NP_ORDER_NOT_FOUND"),
    /** The business key is not configured (NOVAPOSHTA_API_KEY). */
    NP_KEY_MISSING("NP_KEY_MISSING"),
    /** The sender (counterparty, contact, branch) is not set up. */
    NP_SENDER_MISSING("NP_SENDER_MISSING"),
    /** A bad request field: {0} what. */
    NP_BAD_REQUEST("NP_BAD_REQUEST"),
    /** The product or category was not found. */
    NP_SIZE_TARGET_NOT_FOUND("NP_SIZE_TARGET_NOT_FOUND"),
    /** Webhooks are not configured (secret/URL). */
    NP_WEBHOOK_OFF("NP_WEBHOOK_OFF");

    private final String code;

    DeliveryError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
