package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.error.DomainException;
import org.springframework.stereotype.Component;

/**
 * Nova Poshta already accepted the parcel of this order: the poll may not have moved the order to SHIPPED yet, but
 * what is in the box, where it goes and to whom can no longer change here (the waybill at NP would silently disagree
 * with the order). The address is changed in the NP cabinet then.
 */
@Component
public class ParcelGuard {

    private final OrderShipmentView shipments;

    public ParcelGuard(OrderShipmentView shipments) {
        this.shipments = shipments;
    }

    /** 400 {@code PARCEL_HANDED_OVER} once the active waybill of the order is in Nova Poshta's hands. */
    public void requireNotHandedOver(Order order) {
        if (order.getId() == null) {
            return;
        }
        shipments.forOrder(order.getId())
                .filter(OrderShipmentView.ShipmentBrief::handedOver)
                .ifPresent(s -> {
                    throw new DomainException.BadRequest(OrderError.PARCEL_HANDED_OVER, s.ttn());
                });
    }
}
