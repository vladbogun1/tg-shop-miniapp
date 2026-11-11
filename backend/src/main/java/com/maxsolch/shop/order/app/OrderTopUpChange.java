package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.MoneyFormat;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The transaction of {@link OrderTopUp}: locks the order, applies the admin's choice, publishes the edit. */
@Service
class OrderTopUpChange {

    /** The saved order and what the audit says about it. */
    record Applied(Order order, String audit) {
    }

    private final OrderOps ops;
    private final OrderRepository orders;
    private final DomainEvents events;

    /** Nothing changes once Nova Poshta holds the parcel. */
    private final ParcelGuard parcels;

    OrderTopUpChange(OrderOps ops, OrderRepository orders, DomainEvents events,
            ParcelGuard parcels) {
        this.parcels = parcels;
        this.ops = ops;
        this.orders = orders;
        this.events = events;
    }

    @Transactional
    public Applied apply(byte[] orderId, OrderTopUp.Mode mode) {
        Order order = ops.lock(orderId);
        order.requireEditable();
        parcels.requireNotHandedOver(order);
        long due = OrderMoney.topUpDueMinor(order);
        if (due <= 0) {
            throw new DomainException.BadRequest(OrderError.TOPUP_NOT_DUE);
        }
        String way = switch (mode) {
            case ONLINE -> {
                order.collectBalanceOnDelivery(false);
                yield "онлайн";
            }
            case ON_DELIVERY -> {
                order.collectBalanceOnDelivery(true);
                yield "наложкой при получении";
            }
            case WAIVE -> {
                order.waiveBalance(due);
                yield "за счёт магазина (скидка)";
            }
        };
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return new Applied(saved, "доплата " + MoneyFormat.uah(due) + " — " + way);
    }
}
