package com.maxsolch.shop.it;

import com.maxsolch.shop.order.app.CancelRequests;

import com.maxsolch.shop.order.app.OrderPayments;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
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
 * Telegram is told only AFTER the commit ({@code @OnCommitted}); a rolled-back cancellation
 * sends nothing and changes nothing.
 */
class OrderCancelEventsIT extends AbstractMysqlIT {

    @Autowired
    Checkout orders;
    @Autowired
    CancelRequests cancelRequests;
    @Autowired
    OrderPayments orderPayments;

    private Order placed(long tg, String phone, Product p, int qty) {
        Order o = orders.createOrder(checkout(tg, phone, p, qty));
        // Placing an order notifies as well; these tests are about the cancellation only.
        Mockito.reset(sellerNotifier, customerNotifier);
        return o;
    }

    @Test
    void cancelByCustomerNotifiesOnlyAfterCommit() {
        Product p = product(5_000, 3);
        Order o = placed(9_001, "+380673330001", p, 2);

        tx.executeWithoutResult(s -> {
            cancelRequests.cancelByCustomer(o.getId(), "передумал");
            verifyNoInteractions(sellerNotifier, customerNotifier); // still inside the transaction
        });

        verify(sellerNotifier).onStatusChanged(any());
        verify(customerNotifier).notifyCustomerStatus(any());
        assertThat(statusOf(o.getId())).isEqualTo("REJECTED");
        assertThat(stockOf(p)).isEqualTo(3);
    }

    @Test
    void rolledBackCancelByCustomerSendsNothingAndKeepsTheOrder() {
        Product p = product(5_000, 3);
        Order o = placed(9_002, "+380673330002", p, 2);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> {
            cancelRequests.cancelByCustomer(o.getId(), "передумал");
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(sellerNotifier, customerNotifier);
        assertThat(statusOf(o.getId())).isEqualTo("NEW");
        assertThat(stockOf(p)).isEqualTo(1);
        assertThat(lotsLeftOf(p)).isEqualTo(1);
    }

    @Test
    void approveCancelRequestNotifiesAfterCommitAndRollbackSendsNothing() {
        Product p = product(5_000, 3);
        Order o = placed(9_003, "+380673330003", p, 1);
        orderPayments.markPaid(o.getId(), 5_000);
        cancelRequests.requestCancel(o.getId(), "не нужен");
        Mockito.reset(sellerNotifier, customerNotifier);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> {
            cancelRequests.approveCancelRequest(o.getId(), "ок");
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(sellerNotifier, customerNotifier);
        assertThat(statusOf(o.getId())).isEqualTo("NEW");
        assertThat(stockOf(p)).isEqualTo(2);

        tx.executeWithoutResult(s -> {
            cancelRequests.approveCancelRequest(o.getId(), "ок");
            verify(customerNotifier, never()).notifyCustomerCancelRequest(any(), eq(true));
        });
        verify(customerNotifier).notifyCustomerCancelRequest(any(), eq(true));
        assertThat(statusOf(o.getId())).isEqualTo("REJECTED");
        assertThat(stockOf(p)).isEqualTo(3);
        assertThat(lotsLeftOf(p)).isEqualTo(3);
    }
}
