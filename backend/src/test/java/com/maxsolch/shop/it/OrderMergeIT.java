package com.maxsolch.shop.it;

import com.maxsolch.shop.order.app.OrderPayments;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.order.app.OrderMerge;
import com.maxsolch.shop.order.app.Checkout;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

/** Two open orders of one customer become one; stock does not move, money and lots follow the lines. */
class OrderMergeIT extends AbstractMysqlIT {

    @Autowired
    Checkout orders;
    @Autowired
    OrderPayments orderPayments;
    @Autowired
    OrderMerge merge;

    @Test
    void mergeSumsLinesMovesMoneyAndLotsAndClosesTheSource() {
        Product a = product(10_000, 5);
        Order target = orders.createOrder(checkout(9_101, "+380674440001", a, 1));
        Order source = orders.createOrder(checkout(9_101, "+380674440001", a, 2));
        orderPayments.markPaid(source.getId(), 20_000);
        int stockA = stockOf(a);
        Mockito.reset(notificationService);

        OrderMerge.Result r = merge.merge(target.getId(), source.getId(), false, false, null, "it");

        // The same product at the same price adds up on the target.
        List<Integer> qty = jdbc.queryForList("SELECT quantity FROM order_items WHERE order_id = ?", Integer.class, target.getId());
        assertThat(qty).containsExactly(3);
        assertThat(longOf("subtotal_minor", target.getId())).isEqualTo(30_000);
        assertThat(longOf("total_minor", target.getId())).isEqualTo(30_000);
        assertThat(longOf("received_minor", target.getId())).isEqualTo(20_000);
        // The source is closed as MERGED, its money is booked as moved, not lost.
        assertThat(statusOf(source.getId())).isEqualTo("REJECTED");
        assertThat(jdbc.queryForObject("SELECT reject_reason_code FROM orders WHERE id = ?", String.class, source.getId()))
                .isEqualTo("MERGED");
        assertThat(jdbc.queryForObject("SELECT merged_into_order_id FROM orders WHERE id = ?", byte[].class, source.getId()))
                .isEqualTo(target.getId());
        assertThat(longOf("refunded_minor", source.getId())).isEqualTo(20_000);
        // Stock does not move; the lots of the source's units now belong to the target's line.
        assertThat(stockOf(a)).isEqualTo(stockA);
        assertThat(lotsLeftOf(a)).isEqualTo(stockA);
        Integer onTarget = jdbc.queryForObject(
                "SELECT COALESCE(SUM(l.qty), 0) FROM order_item_lots l JOIN order_items i ON i.id = l.order_item_id "
                        + "WHERE i.order_id = ?", Integer.class, target.getId());
        assertThat(onTarget).isEqualTo(3);
        Long moved = jdbc.queryForObject("SELECT COALESCE(SUM(amount_minor), 0) FROM order_money_movements "
                + "WHERE order_id = ? AND kind = 'PAYMENT' AND note LIKE 'перенесено из заказа%'", Long.class, target.getId());
        assertThat(moved).isEqualTo(20_000);
        assertThat(r.target().getId()).isEqualTo(target.getId());
        // The Merged event goes out after the commit.
        verify(notificationService, atLeastOnce()).onStatusChanged(any());
    }
}
