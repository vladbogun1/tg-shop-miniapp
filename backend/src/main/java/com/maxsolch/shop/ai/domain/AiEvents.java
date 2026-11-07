package com.maxsolch.shop.ai.domain;

/**
 * What the owner must hear about (the seven push warnings of docs/ai-admin/04-design-final.md, section 6): the events
 * are published by the scenarios that notice them, {@code AiNotifier} turns each into one push per period.
 */
public final class AiEvents {

    private AiEvents() {
    }

    public enum Period { DAY, MONTH }

    /** The spend reached the limit of the period: nothing new starts until the period ends or the limit is raised. */
    public record LimitReached(Period period, long spentMicroUsd, long limitMicroUsd) {
    }

    /** The month's spend crossed 80 % of the limit. */
    public record SpendWarning(long spentMicroUsd, long limitMicroUsd) {
    }

    /** The provider refused the key or the balance is empty (HTTP 401 / 402 / 403 from the model). */
    public record KeyRejected(String reason) {
    }

    /** Every configured search provider failed. */
    public record SearchDown() {
    }

    /** The free Serper requests passed 80 %. */
    public record FreeSearchWarning(int used, int total) {
    }

    /** A batch stopped because of the limit (batches arrive in a later stage; the push is ready for them). */
    public record BatchStopped(int done, int total, Period period) {
    }
}
