package com.maxsolch.shop.inbox;

import com.maxsolch.shop.analytics.metrics.MetricsDtos.ReorderRow;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.inbox.InboxDtos.Group;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.inbox.InboxFacts.ChatRow;
import com.maxsolch.shop.inbox.InboxFacts.OrderRow;
import com.maxsolch.shop.site.SiteRevalidator;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Which rows the «Внимание» screen shows, in what order, and what the owner's marks hide. */
class InboxRulesTest {

    static final Instant NOW = Instant.parse("2026-10-04T12:00:00Z");
    static final InboxRules.Thresholds T = new InboxRules.Thresholds(3, 24);

    // ------------------------------------------------------------------ fixtures

    static final class O {
        String id = "11111111-0000-0000-0000-000000000000";
        OrderStatus status = OrderStatus.NEW;
        String name = "Оля";
        long total = 100_000;
        long prepayment = 0;
        long refunded = 0;
        Instant created = NOW.minus(Duration.ofMinutes(30));
        Instant approved;
        Instant shipped;
        Instant rejected;
        Instant returned;
        long received = 0;
        boolean paid;
        Instant paidAt;
        boolean paidOnline;
        String reason;
        String reasonCode;

        O id(String v) {
            id = v;
            return this;
        }

        O status(OrderStatus v) {
            status = v;
            return this;
        }

        O created(Duration ago) {
            created = NOW.minus(ago);
            return this;
        }

        O approved(Duration ago) {
            approved = NOW.minus(ago);
            return this;
        }

        O shipped(Duration ago) {
            shipped = NOW.minus(ago);
            return this;
        }

        O rejected(Duration ago) {
            rejected = NOW.minus(ago);
            return this;
        }

        O returned(Duration ago, long refundedMinor) {
            returned = NOW.minus(ago);
            refunded = refundedMinor;
            return this;
        }

        /** Paid online (a monobank invoice credited) {@code ago}, {@code minor} received. */
        O paidOnline(Duration ago, long minor) {
            paid = true;
            paidOnline = true;
            paidAt = NOW.minus(ago);
            received = minor;
            return this;
        }

        O paidOnline(Duration ago) {
            return paidOnline(ago, total);
        }

        /** Paid, but recorded by an admin (no monobank invoice). */
        O paidByAdmin() {
            paid = true;
            paidAt = NOW.minus(Duration.ofMinutes(10));
            received = total;
            return this;
        }

        O refunded(long minor) {
            refunded = minor;
            return this;
        }

        OrderRow row() {
            return new OrderRow(id, status, name, total, received, prepayment, refunded, created, approved, shipped,
                    rejected, returned, paid, paidAt, paidOnline, reason, reasonCode);
        }
    }

    static O order() {
        return new O();
    }

    static String id(int n) {
        return String.format("%08d-0000-0000-0000-000000000000", n);
    }

    static InboxFacts facts(List<OrderRow> orders, List<ChatRow> chats, List<ReorderRow> stock,
                            SiteRevalidator.Status site) {
        return new InboxFacts(NOW, orders, chats, stock, site);
    }

    static InboxFacts orders(OrderRow... rows) {
        return facts(List.of(rows), List.of(), List.of(), null);
    }

    static Group group(Inbox inbox, InboxItemType type) {
        return inbox.groups().stream().filter(g -> g.id().equals(type.name())).findFirst().orElseThrow();
    }

    static List<String> ids(Inbox inbox, InboxItemType type) {
        return group(inbox, type).items().stream().map(Item::entityId).toList();
    }

    static ReorderRow stockRow(String productId, String variantId, int stock, Double daysToZero) {
        return new ReorderRow(productId, variantId, "Свеча", variantId == null ? null : "Лаванда", stock, 6, 12,
                0.4, daysToZero, 10, 0, 0, true, "soon");
    }

    // ------------------------------------------------------------------ selection

    @Test
    void paidOnline_newOrdersOnly() {
        Inbox inbox = InboxRules.build(orders(
                order().id(id(1)).paidOnline(Duration.ofMinutes(20)).row(),
                order().id(id(2)).paidOnline(Duration.ofMinutes(20)).status(OrderStatus.APPROVED).row(),
                order().id(id(3)).paidByAdmin().row(),
                order().id(id(4)).row()), Map.of(), T);

        assertThat(ids(inbox, InboxItemType.PAYMENT)).containsExactly(id(1));
        Item it = group(inbox, InboxItemType.PAYMENT).items().get(0);
        assertThat(it.subtitle()).isEqualTo(InboxRules.PAID_CONFIRM);
        assertThat(it.waitMinutes()).isEqualTo(20);
        assertThat(it.version()).isEqualTo("paid:" + NOW.minus(Duration.ofMinutes(20)).toEpochMilli());
        assertThat(it.amountMinor()).isEqualTo(100_000);
        assertThat(it.amountNote()).isEqualTo("оплачено");
        assertThat(it.shortId()).isEqualTo("00000001");
    }

    @Test
    void paidOnline_prepaymentShowsTheReceivedPart() {
        O o = order().paidOnline(Duration.ofMinutes(5), 20_000);
        o.prepayment = 20_000;
        Item it = group(InboxRules.build(orders(o.row()), Map.of(), T), InboxItemType.PAYMENT).items().get(0);

        assertThat(it.amountMinor()).isEqualTo(20_000);
        assertThat(it.amountNote()).isEqualTo("предоплата");
    }

    @Test
    void cancelRequest_pendingOnUnshippedOrder_replacesPaidConfirm() {
        O paidNew = order().id(id(1)).paidOnline(Duration.ofHours(2));
        O paidShipped = order().id(id(2)).paidOnline(Duration.ofHours(2)).status(OrderStatus.SHIPPED);
        OrderRow pending = withRequest(paidNew.row(), "PENDING", "не той розмір", NOW.minus(Duration.ofMinutes(15)));
        OrderRow shipped = withRequest(paidShipped.row(), "PENDING", "x", NOW.minus(Duration.ofMinutes(15)));
        OrderRow declined = withRequest(order().id(id(3)).paidOnline(Duration.ofHours(2)).row(), "DECLINED", "x",
                NOW.minus(Duration.ofMinutes(15)));

        Inbox inbox = InboxRules.build(orders(pending, shipped, declined), Map.of(), T);

        List<Item> payment = group(inbox, InboxItemType.PAYMENT).items();
        Item request = payment.stream().filter(i -> i.entityId().equals(id(1))).findFirst().orElseThrow();
        assertThat(request.subtitle()).startsWith(InboxRules.CANCEL_REQUEST).contains("не той розмір");
        assertThat(request.waitMinutes()).isEqualTo(15);
        // a declined request is back to the normal "paid — confirm" row
        assertThat(payment.stream().filter(i -> i.entityId().equals(id(3))).findFirst().orElseThrow().subtitle())
                .isEqualTo(InboxRules.PAID_CONFIRM);
        assertThat(payment.stream().map(Item::entityId)).doesNotContain(id(2));
    }

    static OrderRow withRequest(OrderRow r, String status, String reason, Instant at) {
        return new OrderRow(r.id(), r.status(), r.customerName(), r.totalMinor(), r.receivedMinor(),
                r.prepaymentMinor(), r.refundedMinor(), r.createdAt(), r.approvedAt(), r.shippedAt(), r.rejectedAt(),
                r.returnedAt(), r.paid(), r.paidAt(), r.paidOnline(), r.rejectReason(), r.rejectReasonCode(),
                status, reason, at);
    }

    @Test
    void paidThenCancelled_untilTheMoneyIsBack() {
        Inbox inbox = InboxRules.build(orders(
                order().id(id(1)).paidOnline(Duration.ofHours(1)).status(OrderStatus.REJECTED)
                        .rejected(Duration.ofMinutes(30)).row(),
                order().id(id(2)).paidOnline(Duration.ofHours(1)).status(OrderStatus.REJECTED)
                        .rejected(Duration.ofMinutes(30)).refunded(100_000).row(),
                order().id(id(3)).paidOnline(Duration.ofHours(1)).status(OrderStatus.REJECTED)
                        .rejected(Duration.ofMinutes(30)).refunded(40_000).row(),
                // refused after shipping — that is the RETURN group's business
                order().id(id(4)).paidOnline(Duration.ofDays(3)).status(OrderStatus.REJECTED)
                        .shipped(Duration.ofDays(2)).rejected(Duration.ofHours(1)).row(),
                order().id(id(5)).status(OrderStatus.REJECTED).rejected(Duration.ofMinutes(30)).row()),
                Map.of(), T);

        assertThat(ids(inbox, InboxItemType.PAYMENT)).containsExactlyInAnyOrder(id(1), id(3));
        Item partial = group(inbox, InboxItemType.PAYMENT).items().stream()
                .filter(i -> i.entityId().equals(id(3))).findFirst().orElseThrow();
        assertThat(partial.subtitle()).isEqualTo(InboxRules.PAID_REFUND);
        assertThat(partial.amountMinor()).isEqualTo(60_000);
        assertThat(partial.amountNote()).isEqualTo("вернуть");
        assertThat(ids(inbox, InboxItemType.RETURN)).containsExactly(id(4));
    }

    @Test
    void newOrder_onlyAfterTheThreshold() {
        Inbox inbox = InboxRules.build(orders(
                order().id(id(1)).created(Duration.ofHours(2)).row(),
                order().id(id(2)).created(Duration.ofHours(3)).row(),
                order().id(id(3)).created(Duration.ofHours(9)).row()), Map.of(), T);

        // oldest first; exactly at the threshold counts
        assertThat(ids(inbox, InboxItemType.NEW_STALE)).containsExactly(id(3), id(2));
        assertThat(group(inbox, InboxItemType.NEW_STALE).items().get(0).overdue()).isTrue(); // ≥ 2 × 3 h
        assertThat(group(inbox, InboxItemType.NEW_STALE).items().get(1).overdue()).isFalse();
    }

    @Test
    void newOrder_thresholdComesFromSettings() {
        OrderRow o = order().created(Duration.ofHours(2)).row();

        assertThat(ids(InboxRules.build(orders(o), Map.of(), new InboxRules.Thresholds(1, 24)),
                InboxItemType.NEW_STALE)).hasSize(1);
        assertThat(ids(InboxRules.build(orders(o), Map.of(), T), InboxItemType.NEW_STALE)).isEmpty();
    }

    @Test
    void approved_countsFromApprovalNotCreation() {
        Inbox inbox = InboxRules.build(orders(
                order().id(id(1)).status(OrderStatus.APPROVED).created(Duration.ofDays(5)).approved(Duration.ofHours(5)).row(),
                order().id(id(2)).status(OrderStatus.APPROVED).created(Duration.ofDays(5)).approved(Duration.ofHours(30)).row(),
                // legacy row without approved_at falls back to created_at
                order().id(id(3)).status(OrderStatus.APPROVED).created(Duration.ofDays(3)).row(),
                order().id(id(4)).status(OrderStatus.SHIPPED).created(Duration.ofDays(5)).approved(Duration.ofDays(4)).row()),
                Map.of(), T);

        assertThat(ids(inbox, InboxItemType.APPROVED_STALE)).containsExactly(id(3), id(2));
    }

    @Test
    void returns_refusalAfterShippingAndRegisteredReturnsWithin14Days() {
        Inbox inbox = InboxRules.build(orders(
                // refused at the post office 2 days ago
                order().id(id(1)).status(OrderStatus.REJECTED).shipped(Duration.ofDays(5)).rejected(Duration.ofDays(2)).row(),
                // rejected before shipping — an ordinary cancellation, not here
                order().id(id(2)).status(OrderStatus.REJECTED).rejected(Duration.ofHours(1)).row(),
                // refused, but 20 days ago
                order().id(id(3)).status(OrderStatus.REJECTED).shipped(Duration.ofDays(25)).rejected(Duration.ofDays(20)).row(),
                // return registered yesterday on a delivered order
                order().id(id(4)).status(OrderStatus.DELIVERED).returned(Duration.ofDays(1), 50_000).row()),
                Map.of(), T);

        // newest first
        assertThat(ids(inbox, InboxItemType.RETURN)).containsExactly(id(4), id(1));
        Item ret = group(inbox, InboxItemType.RETURN).items().get(0);
        assertThat(ret.subtitle()).isEqualTo("Зарегистрирован возврат");
        assertThat(ret.amountMinor()).isEqualTo(50_000);
        assertThat(group(inbox, InboxItemType.RETURN).items().get(1).subtitle()).startsWith("Отказ после отправки");
    }

    @Test
    void returns_refusalWithLaterReturnIsOneRowVersionedByTheLatestEvent() {
        OrderRow o = order().status(OrderStatus.REJECTED).shipped(Duration.ofDays(6))
                .rejected(Duration.ofDays(3)).returned(Duration.ofDays(1), 10_000).row();
        List<Item> items = group(InboxRules.build(orders(o), Map.of(), T), InboxItemType.RETURN).items();

        assertThat(items).hasSize(1);
        assertThat(items.get(0).version()).isEqualTo(InboxRules.version(o.returnedAt()));
    }

    @Test
    void chats_oldestUnreadFirst_withOrderData() {
        OrderRow o = order().id(id(1)).status(OrderStatus.SHIPPED).row();
        InboxFacts f = facts(List.of(o), List.of(
                new ChatRow(id(1), 2, 501, NOW.minus(Duration.ofMinutes(10)), "Где посылка?"),
                new ChatRow(id(2), 1, 777, NOW.minus(Duration.ofHours(3)), "")), List.of(), null);

        Inbox inbox = InboxRules.build(f, Map.of(), T);

        List<Item> chats = group(inbox, InboxItemType.CHAT).items();
        assertThat(chats).extracting(Item::entityId).containsExactly(id(2), id(1));
        assertThat(chats.get(0).overdue()).isTrue();
        assertThat(chats.get(0).subtitle()).isEqualTo("Вложение");
        assertThat(chats.get(1).title()).isEqualTo("Оля");
        assertThat(chats.get(1).unread()).isEqualTo(2);
        assertThat(chats.get(1).version()).isEqualTo("501");
        assertThat(chats.get(1).status()).isEqualTo("SHIPPED");
    }

    @Test
    void stock_variantRowsKeyedByProductAndVariant_soonestFirst() {
        InboxFacts f = facts(List.of(), List.of(), List.of(
                stockRow("p1", null, 5, 9.6),
                stockRow("p2", "v1", 0, 0.0)), null);

        List<Item> items = group(InboxRules.build(f, Map.of(), T), InboxItemType.LOW_STOCK).items();

        assertThat(items).extracting(Item::entityId).containsExactly("p2:v1", "p1");
        assertThat(items.get(0).title()).isEqualTo("Свеча — Лаванда");
        assertThat(items.get(0).subtitle()).startsWith("Закончился");
        assertThat(items.get(1).subtitle()).isEqualTo("Осталось 5 шт. · хватит на ~10 дн.");
        assertThat(items.get(1).version()).isEqualTo("5");
    }

    @Test
    void site_onlyWhenTheLastCallFailed() {
        Instant earlier = NOW.minus(Duration.ofHours(2));
        Instant later = NOW.minus(Duration.ofHours(1));

        assertThat(InboxRules.siteFailing(new SiteRevalidator.Status(true, earlier, later, "HTTP 500"))).isTrue();
        assertThat(InboxRules.siteFailing(new SiteRevalidator.Status(true, later, earlier, "HTTP 500"))).isFalse();
        assertThat(InboxRules.siteFailing(new SiteRevalidator.Status(true, null, later, "x"))).isTrue();
        assertThat(InboxRules.siteFailing(new SiteRevalidator.Status(false, null, later, "x"))).isFalse();
        assertThat(InboxRules.siteFailing(null)).isFalse();

        Inbox inbox = InboxRules.build(facts(List.of(), List.of(), List.of(),
                new SiteRevalidator.Status(true, earlier, later, "сайт ответил HTTP 500")), Map.of(), T);
        Item it = group(inbox, InboxItemType.SITE_ERROR).items().get(0);
        assertThat(it.subtitle()).isEqualTo("сайт ответил HTTP 500");
        assertThat(it.waitMinutes()).isEqualTo(60);
    }

    @Test
    void groupsAlwaysPresentInOrderOfUrgency_totalCountsVisibleRows() {
        Inbox inbox = InboxRules.build(orders(
                order().id(id(1)).paidOnline(Duration.ofMinutes(5)).created(Duration.ofHours(4)).row()), Map.of(), T);

        assertThat(inbox.groups()).extracting(Group::id).containsExactly(
                "PAYMENT", "APPROVED_UNPAID", "CHAT", "SUPPORT", "NEW_STALE", "APPROVED_STALE", "RETURN", "REVIEW", "LOW_STOCK",
                "SITE_ERROR");
        // the same order needs two different things: confirm the payment AND approve it
        assertThat(inbox.total()).isEqualTo(2);
        assertThat(group(inbox, InboxItemType.RETURN).dismissible()).isTrue();
        assertThat(group(inbox, InboxItemType.PAYMENT).dismissible()).isFalse();
    }

    // ------------------------------------------------------------------ marks

    @Test
    void snooze_hidesUntilItEnds_andCountsAsSnoozed() {
        OrderRow o = order().id(id(1)).paidOnline(Duration.ofMinutes(20)).row();
        String version = "paid:" + InboxRules.version(o.paidAt());
        Map<String, InboxMark> marks = Map.of(InboxMark.key(InboxItemType.PAYMENT, id(1)),
                new InboxMark(InboxItemType.PAYMENT, id(1), version, InboxMark.Kind.SNOOZED, NOW.plus(Duration.ofHours(1))));

        Inbox hidden = InboxRules.build(orders(o), marks, T);
        assertThat(group(hidden, InboxItemType.PAYMENT).items()).isEmpty();
        assertThat(group(hidden, InboxItemType.PAYMENT).snoozed()).isEqualTo(1);
        assertThat(hidden.total()).isZero();

        Map<String, InboxMark> expired = Map.of(InboxMark.key(InboxItemType.PAYMENT, id(1)),
                new InboxMark(InboxItemType.PAYMENT, id(1), version, InboxMark.Kind.SNOOZED, NOW.minusSeconds(1)));
        assertThat(InboxRules.build(orders(o), expired, T).total()).isEqualTo(1);
    }

    @Test
    void snooze_aNewEventResurfacesTheRow() {
        // snoozed at message 500; a new customer message (id 501) arrived since
        Map<String, InboxMark> marks = new HashMap<>();
        marks.put(InboxMark.key(InboxItemType.CHAT, id(1)),
                new InboxMark(InboxItemType.CHAT, id(1), "500", InboxMark.Kind.SNOOZED, NOW.plus(Duration.ofDays(3))));
        InboxFacts f = facts(List.of(), List.of(new ChatRow(id(1), 2, 501, NOW.minus(Duration.ofMinutes(30)), "ещё вопрос")),
                List.of(), null);

        Inbox inbox = InboxRules.build(f, marks, T);

        assertThat(ids(inbox, InboxItemType.CHAT)).containsExactly(id(1));
        assertThat(group(inbox, InboxItemType.CHAT).snoozed()).isZero();
    }

    @Test
    void dismiss_hidesForGood_untilTheEventChanges() {
        OrderRow o = order().id(id(1)).status(OrderStatus.DELIVERED).returned(Duration.ofDays(1), 1_000).row();
        String version = InboxRules.version(o.returnedAt());
        Map<String, InboxMark> marks = Map.of(InboxMark.key(InboxItemType.RETURN, id(1)),
                new InboxMark(InboxItemType.RETURN, id(1), version, InboxMark.Kind.DISMISSED, null));

        Inbox inbox = InboxRules.build(orders(o), marks, T);
        assertThat(ids(inbox, InboxItemType.RETURN)).isEmpty();
        assertThat(group(inbox, InboxItemType.RETURN).snoozed()).isZero();

        // a second return registered later is a new event
        OrderRow again = order().id(id(1)).status(OrderStatus.DELIVERED).returned(Duration.ofHours(1), 2_000).row();
        assertThat(ids(InboxRules.build(orders(again), marks, T), InboxItemType.RETURN)).containsExactly(id(1));
    }

    @Test
    void stock_dismissedRowComesBackWhenStockDropsFurther() {
        Map<String, InboxMark> marks = Map.of(InboxMark.key(InboxItemType.LOW_STOCK, "p1"),
                new InboxMark(InboxItemType.LOW_STOCK, "p1", "5", InboxMark.Kind.DISMISSED, null));

        assertThat(InboxRules.build(facts(List.of(), List.of(), List.of(stockRow("p1", null, 5, 9.0)), null),
                marks, T).total()).isZero();
        assertThat(InboxRules.build(facts(List.of(), List.of(), List.of(stockRow("p1", null, 2, 4.0)), null),
                marks, T).total()).isEqualTo(1);
    }

    static OrderRow approvedOnline(String id, long total, long prepayment, long received, Instant dueAt) {
        return new OrderRow(id, OrderStatus.APPROVED, "Оля", total, received, prepayment, 0,
                NOW.minus(Duration.ofDays(2)), NOW.minus(Duration.ofHours(1)), null, null, null,
                received > 0, received > 0 ? NOW.minus(Duration.ofHours(2)) : null, received > 0, null, null,
                null, null, null, dueAt);
    }

    @Test
    void approvedWithoutTheOnlinePayment_ownGroupCountedInTheBadge() {
        Instant expired = NOW.minus(Duration.ofHours(5));
        Inbox inbox = InboxRules.build(orders(
                // prepayment 100 ₴ never came, deadline passed
                approvedOnline(id(1), 135_000, 10_000, 0, expired),
                // «Полная оплата онлайн» not paid yet, deadline ahead
                approvedOnline(id(2), 50_000, 0, 0, NOW.plus(Duration.ofHours(3))),
                // prepayment arrived — nothing to warn about
                approvedOnline(id(3), 90_000, 10_000, 10_000, expired),
                // an old order (no online deadline) is not an online-payment order
                approvedOnline(id(4), 70_000, 0, 0, null)), Map.of(), T);

        Group g = group(inbox, InboxItemType.APPROVED_UNPAID);
        assertThat(g.items()).extracting(Item::entityId).containsExactlyInAnyOrder(id(1), id(2));
        assertThat(g.count()).isEqualTo(2);
        Item prepay = g.items().stream().filter(i -> i.entityId().equals(id(1))).findFirst().orElseThrow();
        assertThat(prepay.amountMinor()).isEqualTo(10_000L);
        assertThat(prepay.subtitle()).startsWith(InboxRules.APPROVED_UNPAID_TEXT).contains("срок оплаты прошёл");
        assertThat(prepay.overdue()).isTrue();
        Item full = g.items().stream().filter(i -> i.entityId().equals(id(2))).findFirst().orElseThrow();
        assertThat(full.amountMinor()).isEqualTo(50_000L);
        assertThat(full.overdue()).isFalse();
        // One row per order: the unpaid ones are not repeated under «Одобрены, не отправлены».
        assertThat(group(inbox, InboxItemType.APPROVED_STALE).items()).extracting(Item::entityId)
                .doesNotContain(id(1), id(2));
        assertThat(inbox.total()).isEqualTo(inbox.groups().stream().mapToInt(Group::count).sum());
    }
}
