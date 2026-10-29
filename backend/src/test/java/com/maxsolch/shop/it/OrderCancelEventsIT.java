package com.maxsolch.shop.it;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.order.app.OrderService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Telegram is told only AFTER the commit ({@code @TransactionalEventListener}); a rolled-back cancellation
 * sends nothing and changes nothing.
 */
class OrderCancelEventsIT extends AbstractMysqlIT {

    @Autowired
    OrderService orders;

    private Order placed(long tg, String phone, Product p, int qty) {
        Order o = orders.createOrder(checkout(tg, phone, p, qty));
        // Placing an order notifies as well; these tests are about the cancellation only.
        Mockito.reset(notificationService);
        return o;
    }

    @Test
    void cancelByCustomerNotifiesOnlyAfterCommit() {
        Product p = product(5_000, 3);
        Order o = placed(9_001, "+380673330001", p, 2);

        tx.executeWithoutResult(s -> {
            orders.cancelByCustomer(o.getId(), "передумал");
            verifyNoInteractions(notificationService); // still inside the transaction
        });

        verify(notificationService).onStatusChanged(any());
        verify(notificationService).notifyCustomerStatus(any());
        assertThat(statusOf(o.getId())).isEqualTo("REJECTED");
        assertThat(stockOf(p)).isEqualTo(3);
    }

    @Test
    void rolledBackCancelByCustomerSendsNothingAndKeepsTheOrder() {
        Product p = product(5_000, 3);
        Order o = placed(9_002, "+380673330002", p, 2);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> {
            orders.cancelByCustomer(o.getId(), "передумал");
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(notificationService);
        assertThat(statusOf(o.getId())).isEqualTo("NEW");
        assertThat(stockOf(p)).isEqualTo(1);
        assertThat(lotsLeftOf(p)).isEqualTo(1);
    }

    @Test
    void approveCancelRequestNotifiesAfterCommitAndRollbackSendsNothing() {
        Product p = product(5_000, 3);
        Order o = placed(9_003, "+380673330003", p, 1);
        orders.markPaid(o.getId(), 5_000);
        orders.requestCancel(o.getId(), "не нужен");
        Mockito.reset(notificationService);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> {
            orders.approveCancelRequest(o.getId(), "ок");
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(notificationService);
        assertThat(statusOf(o.getId())).isEqualTo("NEW");
        assertThat(stockOf(p)).isEqualTo(2);

        tx.executeWithoutResult(s -> {
            orders.approveCancelRequest(o.getId(), "ок");
            verify(notificationService, never()).notifyCustomerCancelRequest(any(), eq(true));
        });
        verify(notificationService).notifyCustomerCancelRequest(any(), eq(true));
        assertThat(statusOf(o.getId())).isEqualTo("REJECTED");
        assertThat(stockOf(p)).isEqualTo(3);
        assertThat(lotsLeftOf(p)).isEqualTo(3);
    }
}
