package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.order.infra.OrderRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Which events keep the seller's «К ОТПРАВКЕ» card in step with the order's status. */
class OrderNotificationListenerTest {

    private static final byte[] ID = new byte[16];

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderSellerNotifier notifications = mock(OrderSellerNotifier.class);
    private final OrderNotificationListener listener =
            new OrderNotificationListener(orders, notifications, mock(OrderCustomerNotifier.class), mock(ImageStorageService.class));

    private Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(ID);
        OrderStates.withStatus(o, status);
        when(orders.findById(ID)).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void statusChangedToApprovedSyncsTheDispatchCard() {
        Order o = order(OrderStatus.APPROVED);
        listener.onStatusChanged(new OrderEvents.StatusChanged(ID));
        verify(notifications).syncDispatchCard(o);
        verify(notifications, never()).removeDispatchCard(any(Order.class));
    }

    @Test
    void statusChangedToAnythingElseRemovesTheDispatchCard() {
        for (OrderStatus s : new OrderStatus[]{OrderStatus.NEW, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.REJECTED}) {
            Order o = order(s);
            listener.onStatusChanged(new OrderEvents.StatusChanged(ID));
            verify(notifications).removeDispatchCard(o);
            verify(notifications, never()).syncDispatchCard(o);
        }
    }

    @Test
    void exchangeFollowsTheSameRule() {
        Order approved = order(OrderStatus.APPROVED);
        listener.onExchanged(new OrderEvents.Exchanged(ID, false, null));
        verify(notifications).syncDispatchCard(approved);

        Order shipped = order(OrderStatus.SHIPPED);
        listener.onExchanged(new OrderEvents.Exchanged(ID, false, null));
        verify(notifications).removeDispatchCard(shipped);
    }

    @Test
    void aReturnOnlyRefreshesAnApprovedCardAndNeverRemoves() {
        Order approved = order(OrderStatus.APPROVED);
        listener.onReturned(new OrderEvents.Returned(ID, false, null, 0));
        verify(notifications).syncDispatchCard(approved);

        Order shipped = order(OrderStatus.SHIPPED);
        listener.onReturned(new OrderEvents.Returned(ID, false, null, 0));
        verify(notifications, never()).syncDispatchCard(shipped);
        verify(notifications, never()).removeDispatchCard(any(Order.class));
    }
}
