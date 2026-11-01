package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * The notification handlers talk to Telegram for seconds. A payment, a status or a tracking number that lands in
 * that time must survive: the handler writes back only the ids of the cards, never the whole row it read earlier.
 */
class OrderNotificationWritesIT extends AbstractMysqlIT {

    @Autowired
    Checkout orders;
    @Autowired
    DomainEvents events;

    @Test
    void aChangeMadeWhileTheHandlerWaitsForTelegramSurvivesAndTheCardIdIsSaved() {
        Product p = product(10_000, 5);
        Order o = orders.createOrder(checkout(9_201, "+380675550001", p, 1));

        doAnswer(inv -> {
            Order seen = inv.getArgument(0);
            assertThat(seen.getItems()).hasSize(1); // lines are loaded: the handler works on a detached copy
            // "Telegram is slow": meanwhile a payment webhook and an admin change the order for real.
            jdbc.update("UPDATE orders SET received_minor = 7777, status = 'SHIPPED', tracking_number = 'TTN-IT' WHERE id = ?",
                    o.getId());
            seen.rememberSellerCard(-100500L, 3, 99, true); // what the real notifier does after posting the card
            return null;
        }).when(sellerNotifier).onStatusChanged(any());

        events.publish(new OrderEvents.StatusChanged(o.getId()));

        assertThat(longOf("received_minor", o.getId())).isEqualTo(7_777);
        assertThat(statusOf(o.getId())).isEqualTo("SHIPPED");
        assertThat(jdbc.queryForObject("SELECT tracking_number FROM orders WHERE id = ?", String.class, o.getId()))
                .isEqualTo("TTN-IT");
        assertThat(longOf("notify_message_id", o.getId())).isEqualTo(99);
        assertThat(longOf("notify_chat_id", o.getId())).isEqualTo(-100500L);
        assertThat(longOf("notify_thread_id", o.getId())).isEqualTo(3);
    }
}
