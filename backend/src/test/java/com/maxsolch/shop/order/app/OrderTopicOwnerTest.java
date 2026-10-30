package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** A customer may listen to the chat of his own order only; the rule used to live in WebSocketConfig. */
class OrderTopicOwnerTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderTopicOwner topic = new OrderTopicOwner(orders);
    private final String orderId = UUID.randomUUID().toString();

    private void orderOf(Long userId) {
        Order o = mock(Order.class);
        when(o.getUserId()).thenReturn(userId);
        when(orders.findById(UuidUtil.toBytes(orderId))).thenReturn(Optional.of(o));
    }

    @Test
    void theCustomerOfTheOrderIsLetIn() {
        orderOf(42L);
        assertThat(topic.isOwner(orderId, 42L)).isTrue();
    }

    @Test
    void anotherCustomerIsNot() {
        orderOf(42L);
        assertThat(topic.isOwner(orderId, 43L)).isFalse();
    }

    @Test
    void anOrderWithoutACustomerBelongsToNobody() {
        orderOf(null);
        assertThat(topic.isOwner(orderId, 0L)).isFalse();
    }

    @Test
    void anUnknownOrderIsRefused() {
        when(orders.findById(any(byte[].class))).thenReturn(Optional.empty());
        assertThat(topic.isOwner(orderId, 42L)).isFalse();
    }

    @Test
    void aKeyThatIsNotAnOrderIdIsRejectedWithTheOldMessage() {
        assertThatThrownBy(() -> topic.isOwner("not-a-uuid", 42L))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("invalid order id");
        assertThat(topic.forbiddenMessage()).isEqualTo("forbidden: not your order");
        assertThat(topic.topicPrefix()).isEqualTo("/topic/orders/");
    }
}
