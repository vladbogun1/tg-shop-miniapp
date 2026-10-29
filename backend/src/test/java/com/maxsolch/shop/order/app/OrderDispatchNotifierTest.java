package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.tg.NotificationService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The seller's dispatch topic: only a card id that changed is written back, and never by flushing the order. */
class OrderDispatchNotifierTest {

    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final NotificationService notificationService = mock(NotificationService.class);
    private final OrderDispatchNotifier notifier = new OrderDispatchNotifier(orderRepository, entityManager,
            notificationService, new TransactionTemplate(mock(PlatformTransactionManager.class)));

    private static Order approvedOrder() {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.APPROVED);
        o.setItems(new ArrayList<>());
        return o;
    }

    @Test
    void broadcastDispatch_writesOnlyChangedCardIds_withoutDirtyFlushingTheOrder() {
        Order posted = approvedOrder();
        Order unchanged = approvedOrder();
        unchanged.setDispatchMessageId(5);
        when(orderRepository.findWithItemsByStatus(OrderStatus.APPROVED)).thenReturn(List.of(posted, unchanged));
        when(notificationService.syncDispatchCard(posted)).thenAnswer(inv -> {
            posted.setDispatchMessageId(99);
            return true;
        });
        when(notificationService.syncDispatchCard(unchanged)).thenReturn(false);

        assertThat(notifier.broadcastDispatch()).isEqualTo(1);

        verify(entityManager).detach(posted);
        verify(entityManager).detach(unchanged);
        verify(orderRepository).updateDispatchMessageId(posted.getId(), 99);
        verify(orderRepository, never()).updateDispatchMessageId(unchanged.getId(), 5);
        verify(orderRepository, never()).save(any());
    }
}
