package com.maxsolch.shop.inbox;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.inbox.InboxDtos.Group;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.inbox.InboxFacts.ChatRow;
import com.maxsolch.shop.inbox.InboxFacts.OrderRow;
import com.maxsolch.shop.site.SiteRevalidator;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure selection logic of the «Внимание» screen: which rows exist, their event version, age and
 * order of urgency, and which of them the owner's marks hide. No I/O — {@link InboxService} loads
 * {@link InboxFacts} and the marks.
 */
public final class InboxRules {

    /** Refusals and returns stay on the screen this long (unless marked «Разобрано»). */
    public static final int RETURNS_DAYS = 14;

    /** A payment claim older than this is shown as overdue. */
    static final Duration PAYMENT_OVERDUE = Duration.ofHours(3);
    /** A customer waiting for an answer longer than this is shown as overdue. */
    static final Duration CHAT_OVERDUE = Duration.ofHours(2);

    /** Thresholds from «Настройки» (group «Внимание»). */
    public record Thresholds(int newStaleHours, int approvedStaleHours) {
    }

    private static final Map<String, String> REASON_LABEL = Map.of(
            "NO_RESPONSE", "не отвечает",
            "CHANGED_MIND", "передумал(а)",
            "OUT_OF_STOCK", "нет в наличии",
            "DUPLICATE", "дубль",
            "NOT_PAID", "не оплачен",
            "REFUSED_AT_POST", "отказ на почте",
            "RETURNED", "возврат",
            "OTHER", "другое");

    private InboxRules() {
    }

    /**
     * Builds the screen.
     *
     * @param marks owner's marks keyed by {@link InboxMark#key}
     */
    public static Inbox build(InboxFacts facts, Map<String, InboxMark> marks, Thresholds t) {
        Instant now = facts.now();
        Map<InboxItemType, List<Item>> all = new EnumMap<>(InboxItemType.class);
        for (InboxItemType type : InboxItemType.values()) {
            all.put(type, new ArrayList<>());
        }

        Map<String, OrderRow> byId = new HashMap<>();
        for (OrderRow o : facts.orders()) {
            byId.put(o.id(), o);
            if (isPaymentClaim(o)) {
                all.get(InboxItemType.PAYMENT).add(payment(o, now));
            }
            if (isNewStale(o, now, t.newStaleHours())) {
                all.get(InboxItemType.NEW_STALE).add(newStale(o, now, t.newStaleHours()));
            }
            if (isApprovedStale(o, now, t.approvedStaleHours())) {
                all.get(InboxItemType.APPROVED_STALE).add(approvedStale(o, now, t.approvedStaleHours()));
            }
            if (isReturnEvent(o, now)) {
                all.get(InboxItemType.RETURN).add(returned(o, now));
            }
        }
        for (ChatRow c : facts.chats()) {
            if (c.unread() <= 0) {
                continue;
            }
            all.get(InboxItemType.CHAT).add(chat(c, byId.get(c.orderId()), now));
        }
        for (ReorderRow r : facts.runningOut()) {
            all.get(InboxItemType.LOW_STOCK).add(lowStock(r));
        }
        if (siteFailing(facts.site())) {
            all.get(InboxItemType.SITE_ERROR).add(siteError(facts.site(), now));
        }

        // Most urgent first within a group: whoever waits longest; returns newest first; stock by days left.
        Comparator<Item> oldestFirst = Comparator.comparing(Item::since,
                Comparator.nullsLast(Comparator.naturalOrder()));
        for (InboxItemType type : InboxItemType.values()) {
            List<Item> items = all.get(type);
            switch (type) {
                case RETURN -> items.sort(oldestFirst.reversed());
                case LOW_STOCK -> items.sort(Comparator.comparing(Item::daysToZero,
                        Comparator.nullsLast(Comparator.naturalOrder())));
                default -> items.sort(oldestFirst);
            }
        }

        List<Group> groups = new ArrayList<>();
        int total = 0;
        for (InboxItemType type : InboxItemType.values()) {
            List<Item> visible = new ArrayList<>();
            int snoozed = 0;
            for (Item it : all.get(type)) {
                InboxMark mark = marks.get(it.key());
                if (mark != null && mark.hides(it.version(), now)) {
                    if (mark.snoozedAt(now)) {
                        snoozed++;
                    }
                    continue;
                }
                visible.add(it);
            }
            total += visible.size();
            groups.add(new Group(type.name(), type.title(), type.hint(), type.dismissible(), visible.size(),
                    snoozed, visible));
        }
        return new Inbox(now, total, groups, t.newStaleHours(), t.approvedStaleHours(), RETURNS_DAYS);
    }

    // ------------------------------------------------------------------ selection

    static boolean isPaymentClaim(OrderRow o) {
        return o.paymentClaimed() && !o.paid() && o.status() != OrderStatus.REJECTED;
    }

    static boolean isNewStale(OrderRow o, Instant now, int hours) {
        return o.status() == OrderStatus.NEW && o.createdAt() != null
                && !o.createdAt().isAfter(now.minus(Duration.ofHours(hours)));
    }

    static boolean isApprovedStale(OrderRow o, Instant now, int hours) {
        Instant from = approvedFrom(o);
        return o.status() == OrderStatus.APPROVED && from != null
                && !from.isAfter(now.minus(Duration.ofHours(hours)));
    }

    /** Refused after it was shipped, or a return registered — within {@link #RETURNS_DAYS}. */
    static boolean isReturnEvent(OrderRow o, Instant now) {
        return returnEventAt(o, now) != null;
    }

    static boolean siteFailing(SiteRevalidator.Status s) {
        return s != null && s.enabled() && s.lastErrorAt() != null
                && (s.lastSuccessAt() == null || s.lastErrorAt().isAfter(s.lastSuccessAt()));
    }

    private static Instant approvedFrom(OrderRow o) {
        // Orders approved before status timestamps existed have no approved_at.
        return o.approvedAt() != null ? o.approvedAt() : o.createdAt();
    }

    private static boolean refusedAfterShipping(OrderRow o) {
        return o.status() == OrderStatus.REJECTED && o.shippedAt() != null && o.rejectedAt() != null;
    }

    /** Time of the latest refusal/return event inside the window, or null. */
    private static Instant returnEventAt(OrderRow o, Instant now) {
        Instant since = now.minus(Duration.ofDays(RETURNS_DAYS));
        Instant at = null;
        if (refusedAfterShipping(o) && !o.rejectedAt().isBefore(since)) {
            at = o.rejectedAt();
        }
        if (o.returnedAt() != null && !o.returnedAt().isBefore(since)
                && (at == null || o.returnedAt().isAfter(at))) {
            at = o.returnedAt();
        }
        return at;
    }

    // ------------------------------------------------------------------ rows

    private static Item payment(OrderRow o, Instant now) {
        Instant since = o.paymentClaimedAt() != null ? o.paymentClaimedAt() : o.createdAt();
        boolean prepay = o.prepaymentMinor() > 0;
        return orderItem(InboxItemType.PAYMENT, o, version(since),
                "Прислал(а) подтверждение перевода — проверьте поступление",
                prepay ? o.prepaymentMinor() : o.totalMinor(), prepay ? "предоплата" : "к оплате",
                null, since, now, overdue(since, now, PAYMENT_OVERDUE));
    }

    private static Item newStale(OrderRow o, Instant now, int hours) {
        return orderItem(InboxItemType.NEW_STALE, o, version(o.createdAt()), "Новый заказ ждёт одобрения",
                o.totalMinor(), null, null, o.createdAt(), now,
                overdue(o.createdAt(), now, Duration.ofHours(2L * hours)));
    }

    private static Item approvedStale(OrderRow o, Instant now, int hours) {
        Instant from = approvedFrom(o);
        return orderItem(InboxItemType.APPROVED_STALE, o, version(from), "Одобрен, но ещё не отправлен",
                o.totalMinor(), null, null, from, now, overdue(from, now, Duration.ofHours(2L * hours)));
    }

    private static Item returned(OrderRow o, Instant now) {
        Instant at = returnEventAt(o, now);
        boolean isReturn = o.returnedAt() != null && o.returnedAt().equals(at);
        String subtitle;
        Long amount;
        String note;
        if (isReturn) {
            subtitle = "Зарегистрирован возврат";
            amount = o.refundedMinor() > 0 ? o.refundedMinor() : null;
            note = amount == null ? null : "вернули покупателю";
        } else {
            String reason = o.rejectReasonCode() == null ? null : REASON_LABEL.get(o.rejectReasonCode());
            String text = o.rejectReason() != null && !o.rejectReason().isBlank() ? o.rejectReason().trim() : null;
            subtitle = "Отказ после отправки"
                    + (reason != null ? " · " + reason : "")
                    + (text != null && !text.equalsIgnoreCase(reason) ? " · " + shorten(text, 80) : "");
            amount = o.totalMinor();
            note = "сумма заказа";
        }
        return orderItem(InboxItemType.RETURN, o, version(at), subtitle, amount, note, null, at, now, false);
    }

    private static Item chat(ChatRow c, OrderRow o, Instant now) {
        String title = o == null ? "Заказ #" + shortId(c.orderId()) : name(o);
        long wait = waitMinutes(c.firstUnreadAt(), now);
        return new Item(InboxMark.key(InboxItemType.CHAT, c.orderId()), InboxItemType.CHAT.name(), c.orderId(),
                String.valueOf(c.lastMessageId()), title,
                c.preview() == null || c.preview().isBlank() ? "Вложение" : shorten(c.preview(), 140),
                c.orderId(), shortId(c.orderId()), o == null ? null : o.status().name(),
                null, null, null, null, null, null, (int) Math.min(Integer.MAX_VALUE, c.unread()),
                c.firstUnreadAt(), wait, overdue(c.firstUnreadAt(), now, CHAT_OVERDUE));
    }

    private static Item lowStock(ReorderRow r) {
        String entity = r.variantId() == null ? r.productId() : r.productId() + ":" + r.variantId();
        String title = r.variantName() == null || r.variantName().isBlank()
                ? r.title() : r.title() + " — " + r.variantName();
        String subtitle;
        if (r.stock() <= 0) {
            subtitle = "Закончился · продавался " + r.sold30() + " шт. за 30 дн.";
        } else {
            long days = r.daysToZero() == null ? 0 : Math.max(1, Math.round(r.daysToZero()));
            subtitle = "Осталось " + r.stock() + " шт. · хватит на ~" + days + " дн.";
        }
        // Version = stock left: once it drops further (or is restocked and runs low again) the row is back.
        return new Item(InboxMark.key(InboxItemType.LOW_STOCK, entity), InboxItemType.LOW_STOCK.name(), entity,
                String.valueOf(r.stock()), title, subtitle, null, null, null, null, null,
                r.productId(), r.variantId(), r.stock(), r.daysToZero(), null, null, 0, r.stock() <= 0);
    }

    private static Item siteError(SiteRevalidator.Status s, Instant now) {
        String error = s.lastError() == null || s.lastError().isBlank() ? "неизвестная ошибка" : s.lastError();
        return new Item(InboxMark.key(InboxItemType.SITE_ERROR, "site"), InboxItemType.SITE_ERROR.name(), "site",
                version(s.lastErrorAt()), "Сайт не подхватил последние изменения", shorten(error, 200),
                null, null, null, null, null, null, null, null, null, null,
                s.lastErrorAt(), waitMinutes(s.lastErrorAt(), now), false);
    }

    private static Item orderItem(InboxItemType type, OrderRow o, String version, String subtitle, Long amount,
                                  String amountNote, Integer unread, Instant since, Instant now, boolean overdue) {
        return new Item(InboxMark.key(type, o.id()), type.name(), o.id(), version, name(o), subtitle,
                o.id(), shortId(o.id()), o.status().name(), amount, amountNote, null, null, null, null, unread,
                since, waitMinutes(since, now), overdue);
    }

    // ------------------------------------------------------------------ helpers

    static String version(Instant at) {
        return at == null ? "0" : String.valueOf(at.toEpochMilli());
    }

    private static boolean overdue(Instant since, Instant now, Duration limit) {
        return since != null && Duration.between(since, now).compareTo(limit) >= 0;
    }

    private static long waitMinutes(Instant since, Instant now) {
        return since == null ? 0 : Math.max(0, Duration.between(since, now).toMinutes());
    }

    private static String name(OrderRow o) {
        return o.customerName() == null || o.customerName().isBlank() ? "Без имени" : o.customerName().trim();
    }

    static String shortId(String id) {
        return id == null ? null : id.length() >= 8 ? id.substring(0, 8) : id;
    }

    private static String shorten(String s, int max) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max - 1) + "…";
    }
}
