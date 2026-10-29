package com.maxsolch.shop.preorder.domain;

/**
 * What happened to a place in a queue. Published inside the transaction; the bot messages (stage 4 of
 * docs/PREORDERS-PLAN.md) listen after commit, so nobody is told about a hold that was rolled back.
 */
public final class PreorderEvents {

    private PreorderEvents() {
    }

    /** The customer joined a queue. */
    public record Subscribed(long subscriptionId) {
    }

    /** Goods arrived: units are kept for the customer until the hold ends. */
    public record HoldGranted(long subscriptionId) {
    }

    /** A hold ends soon and nothing was bought yet. */
    public record HoldEnding(long subscriptionId) {
    }

    /** A hold ran out; the units went to the next person or on sale. */
    public record HoldExpired(long subscriptionId) {
    }

    /** Goods arrived but not enough: the customer is still waiting, {@code position} in line. */
    public record StillWaiting(long subscriptionId, int position) {
    }

    /** «Everybody at once» arrival: the customer is told, first to buy wins. */
    public record ArrivedNotice(long subscriptionId) {
    }

    /** The shop closed the place (batch cancelled, product removed, admin took them off the list). */
    public record Closed(long subscriptionId, String reason) {
    }

    /** The batch that was to bring the goods is cancelled; the customer stays on the list without a date. */
    public record BatchCancelledKept(long subscriptionId) {
    }
}
