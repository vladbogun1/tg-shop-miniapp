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
    NP_TTN_EXISTS("SHIPMENT_EXISTS"),
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
    NP_WEBHOOK_OFF("NP_WEBHOOK_OFF"),
    /** NP did not answer a write in time; it may have been done: {0} what to do. */
    NP_UNCERTAIN("NP_UNCERTAIN"),
    /** The waybill exists at NP but our row did not save: {0} what to do. */
    NP_NOT_SAVED("NP_NOT_SAVED"),
    /** NP refused to delete a printed waybill: {0} the reason and what to do. */
    NP_DELETE_FAILED("NP_DELETE_FAILED"),
    /** The old waybill was deleted, the new one failed: {0} the reason. */
    NP_REMAKE_FAILED("NP_REMAKE_FAILED"),
    /** The online payment has not arrived; making the waybill needs the admin's confirmation: {0}. */
    NP_UNPAID("ORDER_UNPAID_SHIP"),
    /** The box is confirmed against the waybill, and the order has none yet. */
    NP_BOX_NO_TTN("NP_BOX_NO_TTN"),
    /** No such box in the catalog. */
    NP_BOX_NOT_FOUND("NP_BOX_NOT_FOUND");

    private final String code;

    DeliveryError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
