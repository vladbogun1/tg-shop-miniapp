package com.maxsolch.shop.it;

import com.maxsolch.shop.order.app.OrderLifecycle;

import com.maxsolch.shop.order.app.OrderPayments;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.app.OrderAdjustmentService;
import com.maxsolch.shop.order.app.OrderAdjustmentService.LineOutcome;
import com.maxsolch.shop.order.app.OrderAdjustmentService.ManualRefund;
import com.maxsolch.shop.order.app.OrderAdjustmentService.ReturnPlan;
import com.maxsolch.shop.order.app.OrderAdjustmentService.WizardLine;
import com.maxsolch.shop.order.app.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Returning a line in parts: the amounts in the database follow OrderMoney.paidForUnitsMinor to the kopeck. */
class OrderPartialReturnIT extends AbstractMysqlIT {

    @Autowired
    OrderService orders;
    @Autowired
    OrderLifecycle lifecycle;
    @Autowired
    OrderPayments orderPayments;
    @Autowired
    OrderAdjustmentService adjustments;
    @Autowired
    OrderRepository orderRepository;

    /** 3 × 3 333 with a 100 discount: 9 899 is not divisible by 3, the units cost 3 299 / 3 300 / 3 300. */
    private Order paidAndShipped(Product p, long tg, String phone, String ttn) {
        Order o = orders.createOrder(checkout(tg, phone, p, 3));
        o = orders.applyDiscount(o.getId(), null, 100L, null, false, false);
        orderPayments.markPaid(o.getId(), 9_899);
        lifecycle.approve(o.getId());
        return lifecycle.ship(o.getId(), ttn);
    }

    private Order withItems(byte[] id) {
        return tx.execute(s -> {
            Order x = orderRepository.findWithItemsById(id).orElseThrow();
            x.getItems().size();
            return x;
        });
    }

    private static ReturnPlan plan(long itemId, int qty, long refundMinor) {
        return new ReturnPlan(List.of(new WizardLine(itemId, qty, LineOutcome.RESTOCK)),
                refundMinor == 0 ? List.of()
                        : List.of(new ManualRefund(OrderMoneyMovement.Channel.CASH, refundMinor, null)),
                0, 0, null, false);
    }

    @Test
    void refundsOfAnIndivisibleLineInPartsAddUpToWhatWasPaid() {
        Product p = product(3_333, 10);
        Order o = paidAndShipped(p, 9_201, "+380675550001", "IT-TTN-1");
        lifecycle.deliver(o.getId());
        assertThat(longOf("total_minor", o.getId())).isEqualTo(9_899);

        Order loaded = withItems(o.getId());
        OrderItem item = loaded.getItems().get(0);
        long first = OrderMoney.paidForUnitsMinor(loaded, item, 0, 1);
        long second = OrderMoney.paidForUnitsMinor(loaded, item, 1, 1);
        long third = OrderMoney.paidForUnitsMinor(loaded, item, 2, 1);
        assertThat(first + second + third).isEqualTo(9_899);

        adjustments.registerReturnPlan(o.getId(), plan(item.getId(), 1, first), "it");
        adjustments.registerReturnPlan(o.getId(), plan(item.getId(), 1, second), "it");
        adjustments.registerReturnPlan(o.getId(), plan(item.getId(), 1, third), "it");

        assertThat(longOf("refunded_minor", o.getId())).isEqualTo(9_899);
        Long journal = jdbc.queryForObject("SELECT SUM(amount_minor) FROM order_money_movements "
                + "WHERE order_id = ? AND kind = 'REFUND'", Long.class, o.getId());
        assertThat(journal).isEqualTo(9_899);
        assertThat(jdbc.queryForObject("SELECT returned_qty FROM order_items WHERE order_id = ?", Integer.class, o.getId()))
                .isEqualTo(3);
        // All three units went back to the shelf and to their lots.
        assertThat(stockOf(p)).isEqualTo(10);
        assertThat(lotsLeftOf(p)).isEqualTo(10);
    }

    @Test
    void partialPickupOfAShippedOrderBooksTheUncollectedValueByTheSameRule() {
        Product p = product(3_333, 10);
        Order o = paidAndShipped(p, 9_202, "+380675550002", "IT-TTN-2");
        Order loaded = withItems(o.getId());
        OrderItem item = loaded.getItems().get(0);

        adjustments.registerReturnPlan(o.getId(), plan(item.getId(), 1, 0), "it");
        adjustments.registerReturnPlan(o.getId(), plan(item.getId(), 1, 0), "it");

        long expected = OrderMoney.paidForUnitsMinor(loaded, item, 0, 1)
                + OrderMoney.paidForUnitsMinor(loaded, item, 1, 1);
        assertThat(longOf("uncollected_minor", o.getId())).isEqualTo(expected);
    }
}
