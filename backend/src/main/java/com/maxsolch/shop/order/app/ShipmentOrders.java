package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * The order side of Nova Poshta waybills, for the {@code delivery} module: read an order as a
 * {@link ShippingOrder}, and move it when the parcel moves (accepted by NP → SHIPPED, picked up → DELIVERED) or when
 * a waybill is made / deleted (the order's tracking number). The status rules stay in {@link Order}; every change
 * takes the order row lock and publishes the usual {@link OrderEvents}.
 */
@Service
public class ShipmentOrders {

    private final OrderRepository orders;
    private final OrderLifecycle lifecycle;
    private final OrderOps ops;
    private final DomainEvents events;

    ShipmentOrders(OrderRepository orders, OrderLifecycle lifecycle, OrderOps ops, DomainEvents events) {
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.ops = ops;
        this.events = events;
    }

    /** The order with its lines; empty for an unknown id. */
    @Transactional(readOnly = true)
    public Optional<ShippingOrder> find(byte[] orderId) {
        return orders.findWithItemsById(orderId).map(ShippingOrder::of);
    }

    /** Several orders (unknown ids skipped), in the order of {@code orderIds}. */
    @Transactional(readOnly = true)
    public List<ShippingOrder> findAll(Collection<byte[]> orderIds) {
        List<ShippingOrder> out = new ArrayList<>();
        for (byte[] id : orderIds) {
            orders.findWithItemsById(id).map(ShippingOrder::of).ifPresent(out::add);
        }
        return out;
    }

    /**
     * Nova Poshta accepted the parcel: NEW / APPROVED → SHIPPED with this waybill. NP physically has the parcel,
     * so a missing online payment does not stop it (the COD on the waybill collects the rest). Returns false when
     * the order is not NEW / APPROVED any more (already shipped, rejected…) — nothing changes then.
     */
    @Transactional
    public boolean markShipped(byte[] orderId, String ttn) {
        Order order = ops.lock(orderId);
        if (order.getStatus() != OrderStatus.NEW && order.getStatus() != OrderStatus.APPROVED) {
            return false;
        }
        lifecycle.ship(orderId, ttn, true);
        return true;
    }

    /**
     * The customer picked the parcel up: SHIPPED → DELIVERED (what was to be collected counts as received). Returns
     * false when the order is not SHIPPED.
     */
    @Transactional
    public boolean markDelivered(byte[] orderId) {
        return markDelivered(orderId, 0);
    }

    /**
     * The customer picked the parcel up and Nova Poshta reports {@code collectedMinor} collected for us
     * («Контроль оплати»): that money is credited to «получено» first (never above the total) and journaled as
     * {@code NP_PAYMENT_CONTROL}, then SHIPPED → DELIVERED settles whatever is still collectable as {@code NP_COD}.
     * Idempotent: once the order is DELIVERED a repeated report returns false and adds nothing.
     */
    @Transactional
    public boolean markDelivered(byte[] orderId, long collectedMinor) {
        Order order = ops.lock(orderId);
        if (order.getStatus() != OrderStatus.SHIPPED) {
            return false;
        }
        long credited = order.creditableOnlineMinor(Math.max(0, collectedMinor));
        if (credited > 0) {
            order.receiveOnline(credited, ops.now());
            ops.ledger(order, OrderMoneyMovement.Kind.PAYMENT, OrderMoneyMovement.Channel.NP_PAYMENT_CONTROL,
                    credited, OrderMoneyMovement.Source.AUTO, null, "получено через «Контроль оплати» НП", null);
        }
        lifecycle.deliver(orderId);
        return true;
    }

    /**
     * The order's tracking number follows its waybill: set when one is made, cleared ({@code null}) when it is
     * deleted. No customer message; the seller cards refresh ({@code Edited.silent}).
     */
    @Transactional
    public void setTrackingNumber(byte[] orderId, String ttnOrNull) {
        Order order = ops.lock(orderId);
        String ttn = ttnOrNull == null || ttnOrNull.isBlank() ? null : ttnOrNull.replaceAll("\\s+", "");
        if (Objects.equals(ttn, order.getTrackingNumber())) {
            return;
        }
        order.changeTrackingNumber(ttn);
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
    }
}
