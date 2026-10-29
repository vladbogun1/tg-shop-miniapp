package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.OrderMoney;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

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

class OrderMergeServiceTest {

    private OrderRepository orders;
    private OrderService orderService;
    private MoneyLedger ledger;
    private OrderMergeService service;

    @BeforeEach
    void setUp() {
        orders = mock(OrderRepository.class);
        orderService = mock(OrderService.class);
        ledger = mock(MoneyLedger.class);
        service = new OrderMergeService(orders, orderService, mock(ApplicationEventPublisher.class), ledger);
        when(orders.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
        // The real recompute: subtotal from the lines, the absolute discount capped at it.
        doAnswer(inv -> {
            Order o = inv.getArgument(0);
            long sub = o.getItems().stream().mapToLong(i -> i.getPriceMinorSnapshot() * i.getQuantity()).sum();
            o.setSubtotalMinor(sub);
            o.setDiscountMinor(Math.min(o.getDiscountMinor(), sub));
            o.setTotalMinor(sub - o.getDiscountMinor());
            return null;
        }).when(orderService).recomputeOrderTotals(any());
    }

    private Order order(OrderStatus status, long tgUserId, OrderItem... items) {
        Order o = new Order();
        o.setId(UuidUtil.toBytes(UUID.randomUUID().toString()));
        o.setStatus(status);
        o.setTgUserId(tgUserId);
        o.setPhone("+380671234567");
        o.setCreatedAt(Instant.now());
        long sub = 0;
        for (OrderItem i : items) {
            i.setOrder(o);
            o.getItems().add(i);
            sub += i.getPriceMinorSnapshot() * i.getQuantity();
        }
        o.setSubtotalMinor(sub);
        o.setTotalMinor(sub);
        when(orderService.lock(argThat(o.getId()))).thenReturn(o);
        return o;
    }

    private static byte[] argThat(byte[] id) {
        return org.mockito.ArgumentMatchers.argThat(a -> Arrays.equals(a, id));
    }

    private static OrderItem item(String title, long price, int qty) {
        OrderItem i = new OrderItem();
        i.setProductId(UuidUtil.toBytes(UUID.randomUUID().toString()));
        i.setTitleSnapshot(title);
        i.setPriceMinorSnapshot(price);
        i.setQuantity(qty);
        return i;
    }

    /** The real case of 25.10: a mouse with 100 ₴ prepaid + glides fully covered by a case prize code. */
    @Test
    void merge_freeOrderIntoPrepaidOne_oneParcelWithTheRestOnDelivery() {
        Order mouse = order(OrderStatus.APPROVED, 42, item("Мышь", 280_000, 1));
        mouse.setPrepaymentMinor(10_000);
        mouse.setReceivedMinor(10_000);
        mouse.setPaid(true);
        mouse.setPaymentDueAt(Instant.now());
        Order glides = order(OrderStatus.APPROVED, 42, item("Глайды", 15_000, 1));
        glides.setDiscountMinor(15_000);
        glides.setTotalMinor(0);
        glides.setPromoCode("CASE9TSRK7");
        glides.setPaid(true);

        OrderMergeService.Result r = service.merge(mouse.getId(), glides.getId(), false, true, null, "admin");

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
        first.setPaymentDueAt(Instant.now().plusSeconds(3600));
        OrderItem pad2 = item("Коврик", 80_000, 1);
        pad2.setProductId(pad.getProductId());
        Order second = order(OrderStatus.NEW, 7, pad2);
        second.setReceivedMinor(80_000);
        second.setPaid(true);

        OrderMergeService.Result r = service.merge(first.getId(), second.getId(), false, false, null, "admin");

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
        b.setPhone("+380509999999");
        assertThatThrownBy(() -> service.merge(a.getId(), b.getId(), false, false, null, "admin"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("одного покупателя");

        Order shipped = order(OrderStatus.SHIPPED, 1, item("C", 1_000, 1));
        assertThatThrownBy(() -> service.merge(a.getId(), shipped.getId(), false, false, null, "admin"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("до отправки");

        Order sealed = order(OrderStatus.APPROVED, 1, item("D", 1_000, 1));
        sealed.setGiftCaseStatus(OrderService.GIFT_CASE_SEALED);
        assertThatThrownBy(() -> service.merge(a.getId(), sealed.getId(), false, false, null, "admin"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("кейс");
        // The other way round is fine: the case stays with the order that stays.
        assertThat(service.merge(sealed.getId(), a.getId(), false, false, null, "admin").target().getItems()).hasSize(2);
    }

    @Test
    void sameCustomer_byPhoneInAnyFormat() {
        Order a = new Order();
        a.setPhone("+38 (067) 123-45-67");
        Order b = new Order();
        b.setPhone("0671234567");
        assertThat(OrderMergeService.sameCustomer(a, b)).isTrue();
        b.setPhone("0671234568");
        assertThat(OrderMergeService.sameCustomer(a, b)).isFalse();
    }
}
