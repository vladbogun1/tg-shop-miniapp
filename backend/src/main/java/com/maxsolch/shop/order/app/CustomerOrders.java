package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.domain.OrderErrors;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * A customer's own orders: which ones they may see and act on. Every {@code /api/me/orders/{id}}
 * endpoint goes through {@link #ownedBy} first, so «is this order mine» is decided in one place.
 */
@Service
public class CustomerOrders {

    private final OrderRepository orderRepository;
    private final Messages messages;

    public CustomerOrders(OrderRepository orderRepository, Messages messages) {
        this.orderRepository = orderRepository;
        this.messages = messages;
    }

    /**
     * The order of the URL if it belongs to {@code userId}: 404 for a malformed, unknown or
     * archived id (archived orders are gone for the customer since V68 — no chat, case or cancel
     * on them), 403 when it is somebody else's or has no owner. Texts are in the request's language.
     */
    public Order ownedBy(String id, long userId) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw OrderErrors.notFound(messages.current("api.order.notFound"));
        }
        Order order = orderRepository.findById(key)
                .filter(o -> o.getArchivedAt() == null)
                .orElseThrow(() -> OrderErrors.notFound(messages.current("api.order.notFound")));
        if (order.getUserId() == null || order.getUserId() != userId) {
            throw OrderErrors.forbidden(messages.current("api.order.notYours"));
        }
        return order;
    }

    /** The customer's orders, newest first, without the archived ones. */
    public List<Order> activeOf(long userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .filter(o -> o.getArchivedAt() == null).toList();
    }
}
