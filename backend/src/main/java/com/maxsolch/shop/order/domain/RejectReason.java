package com.maxsolch.shop.order.domain;

/**
 * The texts the shop itself writes into {@code orders.reject_reason} (in Russian, for the seller; an admin's own words are
 * free text and not listed here). Each is a prefix plus what the writer adds; {@code CustomerRejectReason} recognises the
 * prefixes and rebuilds the text in the customer's language, so the writer and the reader share this one list.
 */
public enum RejectReason {
    /** The customer cancelled an unpaid order: "Отменён покупателем[: preset or own words]". */
    BY_CUSTOMER("Отменён покупателем"),
    /** The admin approved the customer's cancellation request: "Отменён по запросу покупателя[: reason]". */
    BY_REQUEST("Отменён по запросу покупателя"),
    /** The payment window ran out: "Не оплачен в течение N ч". */
    UNPAID("Не оплачен в течение "),
    /** Merged into another order: "Объединён с заказом #1a2b3c4d". */
    MERGED("Объединён с заказом #");

    private final String prefix;

    RejectReason(String prefix) {
        this.prefix = prefix;
    }

    /** The fixed beginning of the stored text. */
    public String prefix() {
        return prefix;
    }

    /** The reason of a customer's cancel or of an approved request, with the explanation after a colon when there is one. */
    public String withExplanation(String explanation) {
        return explanation == null || explanation.isBlank() ? prefix : prefix + ": " + explanation;
    }

    public static String unpaid(int hours) {
        return UNPAID.prefix + hours + " ч";
    }

    public static String merged(String targetShortId) {
        return MERGED.prefix + targetShortId;
    }
}
