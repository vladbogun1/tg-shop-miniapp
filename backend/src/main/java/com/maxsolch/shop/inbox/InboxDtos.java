package com.maxsolch.shop.inbox;

import java.time.Instant;
import java.util.List;

/** Wire shapes of {@code /api/admin/inbox}. */
public final class InboxDtos {

    private InboxDtos() {
    }

    /**
     * One row: what, about which order/product, how long it has been waiting.
     *
     * @param key         {@code TYPE:entityId} — stable React key, and what snooze/dismiss address
     * @param entityId    order id, {@code productId} or {@code productId:variantId}, or {@code site}
     * @param version     event version to send back with snooze/dismiss
     * @param title       main line (customer name, product title…)
     * @param subtitle    second line (message preview, reason, stock left…), may be null
     * @param amountMinor money involved (order total, refund…), null when not applicable
     * @param amountNote  what the amount is («предоплата», «вернули»…), may be null
     * @param since       when the waiting started; null when age does not apply (stock)
     * @param waitMinutes minutes since {@code since} (0 when null)
     * @param overdue     waiting far longer than expected — the UI shows the age in red
     */
    public record Item(
            String key,
            String type,
            String entityId,
            String version,
            String title,
            String subtitle,
            String orderId,
            String shortId,
            String status,
            Long amountMinor,
            String amountNote,
            String productId,
            String variantId,
            Integer stock,
            Double daysToZero,
            Integer unread,
            Instant since,
            long waitMinutes,
            boolean overdue) {
    }

    /**
     * One group (= one {@link InboxItemType}), most urgent first within it.
     *
     * @param snoozed rows of this kind hidden by «Отложить» right now
     */
    public record Group(String id, String title, String hint, boolean dismissible, int count, int snoozed,
                        List<Item> items) {
    }

    /**
     * The whole screen. Every group is present (also empty ones), in the order of urgency.
     *
     * @param total visible rows across all groups — the menu/bell badge
     */
    public record Inbox(Instant generatedAt, int total, List<Group> groups, int newStaleHours,
                        int approvedStaleHours, int returnsDays) {
    }

    /** {@code POST /snooze}: {@code preset} = HOUR | TOMORROW | DAYS3. */
    public record SnoozeRequest(String type, String entityId, String version, String preset) {
    }

    public record SnoozeResult(Instant until) {
    }

    /** {@code POST /dismiss} (informational rows only). */
    public record DismissRequest(String type, String entityId, String version) {
    }

    /** {@code POST /restore}: drop the mark of a row (undo «Отложить» / «Разобрано»). */
    public record RestoreRequest(String type, String entityId) {
    }
}
