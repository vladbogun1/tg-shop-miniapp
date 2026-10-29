package com.maxsolch.shop.it;

import com.maxsolch.shop.order.app.OrderLifecycle;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Checkout reserves stock and FIFO lots in the same transaction; a REJECT gives both back. */
class OrderStockIT extends AbstractMysqlIT {

    @Autowired
    Checkout orders;
    @Autowired
    OrderLifecycle lifecycle;

    @Test
    void checkoutTakesStockFromOldestLotsFirstAndRejectGivesThemBack() {
        Product p = product(10_000, 2, 3); // two lots: 2 and 3 units, oldest first
        assertThat(lotQtyLeft(p)).containsExactly(2, 3);

        Order order = orders.createOrder(checkout(7_001, "+380671110001", p, 4));

        assertThat(stockOf(p)).isEqualTo(1);
        assertThat(lotQtyLeft(p)).containsExactly(0, 1);
        assertThat(lotsLeftOf(p)).isEqualTo(stockOf(p));
        // The order line remembers where its 4 units came from: 2 + 2.
        List<Integer> allocations = jdbc.queryForList(
                "SELECT l.qty FROM order_item_lots l JOIN order_items i ON i.id = l.order_item_id "
                        + "WHERE i.order_id = ? ORDER BY l.id", Integer.class, order.getId());
        assertThat(allocations).containsExactly(2, 2);
        assertThat(statusOf(order.getId())).isEqualTo("NEW");

        lifecycle.reject(order.getId(), "тест", true);

        assertThat(statusOf(order.getId())).isEqualTo("REJECTED");
        assertThat(stockOf(p)).isEqualTo(5);
        // The units return to the lots they came from, so the oldest lot is full again.
        assertThat(lotQtyLeft(p)).containsExactly(2, 3);
        assertThat(lotsLeftOf(p)).isEqualTo(stockOf(p));
    }

    @Test
    void rejectWithoutRestockLeavesTheGoodsOffTheShelf() {
        Product p = product(10_000, 5);
        Order order = orders.createOrder(checkout(7_002, "+380671110002", p, 2));

        lifecycle.reject(order.getId(), "брак", false);

        assertThat(stockOf(p)).isEqualTo(3);
        assertThat(lotsLeftOf(p)).isEqualTo(3);
    }

    @Test
    void refusedCheckoutOfMoreThanInStockChangesNothing() {
        Product p = product(10_000, 2);

        assertThatThrownBy(() -> orders.createOrder(checkout(7_003, "+380671110003", p, 3)))
                .isInstanceOf(DomainException.BadRequest.class);

        assertThat(stockOf(p)).isEqualTo(2);
        assertThat(lotQtyLeft(p)).containsExactly(2);
    }
}
