package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.OrderMoney;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.maxsolch.shop.platform.tx.DomainEvents;

import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderMergeTest {

    private OrderRepository orders;
    private OrderOps ops;
    private MoneyLedger ledger;
    private OrderMerge service;

    @BeforeEach
    void setUp() {
        orders = mock(OrderRepository.class);
        ops = mock(OrderOps.class);
        when(ops.now()).thenAnswer(inv -> Instant.now());
        ledger = mock(MoneyLedger.class);
        service = new OrderMerge(orders, ops, mock(DomainEvents.class), ledger);
        when(orders.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
        // The real recompute: subtotal from the lines, the absolute discount capped at it.
        doAnswer(inv -> {
            Order o = inv.getArgument(0);
            long sub = o.getItems().stream().mapToLong(i -> i.getPriceMinorSnapshot() * i.getQuantity()).sum();
            OrderFixtures.set(o, "subtotalMinor", sub);
            OrderFixtures.set(o, "discountMinor", Math.min(o.getDiscountMinor(), sub));
            OrderFixtures.set(o, "totalMinor", sub - o.getDiscountMinor());
            return null;
        }).when(ops).recomputeTotals(any());
    }

    private Order order(OrderStatus status, long tgUserId, OrderItem... items) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.toBytes(UUID.randomUUID().toString()));
        OrderStates.withStatus(o, status);
        OrderFixtures.set(o, "tgUserId", tgUserId);
        OrderFixtures.set(o, "phone", "+380671234567");
        OrderFixtures.set(o, "createdAt", Instant.now());
        long sub = 0;
        for (OrderItem i : items) {
            OrderFixtures.set(i, "order", o);
            o.addLine(i);
            sub += i.getPriceMinorSnapshot() * i.getQuantity();
        }
        OrderFixtures.set(o, "subtotalMinor", sub);
        OrderFixtures.set(o, "totalMinor", sub);
        when(ops.lock(argThat(o.getId()))).thenReturn(o);
        return o;
    }

    private static byte[] argThat(byte[] id) {
        return org.mockito.ArgumentMatchers.argThat(a -> Arrays.equals(a, id));
    }

    private static OrderItem item(String title, long price, int qty) {
        OrderItem i = new OrderItem();
        OrderFixtures.set(i, "productId", UuidUtil.toBytes(UUID.randomUUID().toString()));
        OrderFixtures.set(i, "titleSnapshot", title);
        OrderFixtures.set(i, "priceMinorSnapshot", price);
        OrderFixtures.set(i, "quantity", qty);
        return i;
    }

    /** The real case of 25.10: a mouse with 100 ₴ prepaid + glides fully covered by a case prize code. */
    @Test
    void merge_freeOrderIntoPrepaidOne_oneParcelWithTheRestOnDelivery() {
        Order mouse = order(OrderStatus.APPROVED, 42, item("Мышь", 280_000, 1));
        OrderFixtures.set(mouse, "prepaymentMinor", 10_000);
        OrderFixtures.set(mouse, "receivedMinor", 10_000);
        OrderFixtures.set(mouse, "paid", true);
        OrderFixtures.set(mouse, "paymentDueAt", Instant.now());
        Order glides = order(OrderStatus.APPROVED, 42, item("Глайды", 15_000, 1));
        OrderFixtures.set(glides, "discountMinor", 15_000);
        OrderFixtures.set(glides, "totalMinor", 0);
        OrderFixtures.set(glides, "promoCode", "CASE9TSRK7");
        OrderFixtures.set(glides, "paid", true);

        OrderMerge.Result r = service.merge(mouse.getId(), glides.getId(), false, true, null, "admin");

        Order t = r.target();
        assertThat(t.getItems()).hasSize(2);
        assertThat(t.getSubtotalMinor()).isEqualTo(295_000);
        assertThat(t.getDiscountMinor()).isEqualTo(15_000);
        assertThat(t.getTotalMinor()).isEqualTo(280_000);
        assertThat(t.getPromoCode()).isEqualTo("CASE9TSRK7");
        assertThat(t.getReceivedMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.amountDueMinor(t)).isZero();
        assertThat(OrderMoney.codMinor(t)).isEqualTo(270_000);

        Order s = r.source();
        assertThat(s.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(s.getRejectReasonCode()).isEqualTo("MERGED");
        assertThat(s.getMergedIntoOrderId()).isEqualTo(mouse.getId());
        assertThat(s.getItems()).hasSize(1); // its own lines stay for the history
    }

    @Test
    void merge_movesTheReceivedMoneyThroughTheJournal_andSameLinesAddUp() {
        OrderItem pad = item("Коврик", 80_000, 1);
        Order first = order(OrderStatus.NEW, 7, pad);
        OrderFixtures.set(first, "paymentDueAt", Instant.now().plusSeconds(3600));
        OrderItem pad2 = item("Коврик", 80_000, 1);
        OrderFixtures.set(pad2, "productId", pad.getProductId());
        Order second = order(OrderStatus.NEW, 7, pad2);
        OrderFixtures.set(second, "receivedMinor", 80_000);
        OrderFixtures.set(second, "paid", true);

        OrderMerge.Result r = service.merge(first.getId(), second.getId(), false, false, null, "admin");

        assertThat(r.target().getItems()).hasSize(1);
        assertThat(r.target().getItems().get(0).getQuantity()).isEqualTo(2);
        assertThat(r.target().getReceivedMinor()).isEqualTo(80_000);
        assertThat(r.target().isPaid()).isTrue();
        // Paid half of the full-online order: the rest is a top-up, no auto-cancel.
        assertThat(OrderMoney.amountDueMinor(r.target())).isEqualTo(80_000);
        assertThat(r.source().getRefundedMinor()).isEqualTo(80_000);
        verify(ledger).record(eq(second.getId()), eq(OrderMoneyMovement.Kind.REFUND), eq(OrderMoneyMovement.Channel.MERGE),
                eq(80_000L), any(), eq("admin"), anyString(), isNull());
        verify(ledger).record(eq(first.getId()), eq(OrderMoneyMovement.Kind.PAYMENT), eq(OrderMoneyMovement.Channel.MERGE),
                eq(80_000L), any(), eq("admin"), anyString(), isNull());
    }

    @Test
    void merge_otherCustomer_shippedOrder_orSealedCaseAway_areRefused() {
        Order a = order(OrderStatus.NEW, 1, item("A", 1_000, 1));
        Order b = order(OrderStatus.NEW, 2, item("B", 1_000, 1));
        OrderFixtures.set(b, "phone", "+380509999999");
        assertThatThrownBy(() -> service.merge(a.getId(), b.getId(), false, false, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class).hasMessageContaining("одного покупателя");

        Order shipped = order(OrderStatus.SHIPPED, 1, item("C", 1_000, 1));
        assertThatThrownBy(() -> service.merge(a.getId(), shipped.getId(), false, false, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class).hasMessageContaining("до отправки");

        Order sealed = order(OrderStatus.APPROVED, 1, item("D", 1_000, 1));
        OrderFixtures.set(sealed, "giftCaseStatus", GiftCaseRules.GIFT_CASE_SEALED);
        assertThatThrownBy(() -> service.merge(a.getId(), sealed.getId(), false, false, null, "admin"))
                .isInstanceOf(DomainException.BadRequest.class).hasMessageContaining("кейс");
        // The other way round is fine: the case stays with the order that stays.
        assertThat(service.merge(sealed.getId(), a.getId(), false, false, null, "admin").target().getItems()).hasSize(2);
    }

    @Test
    void sameCustomer_byPhoneInAnyFormat() {
        Order a = new Order();
        OrderFixtures.set(a, "phone", "+38 (067) 123-45-67");
        Order b = new Order();
        OrderFixtures.set(b, "phone", "0671234567");
        assertThat(OrderMerge.sameCustomer(a, b)).isTrue();
        OrderFixtures.set(b, "phone", "0671234568");
        assertThat(OrderMerge.sameCustomer(a, b)).isFalse();
    }
}
