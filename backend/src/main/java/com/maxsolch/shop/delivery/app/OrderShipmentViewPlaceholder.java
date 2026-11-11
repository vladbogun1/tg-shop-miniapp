package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.order.app.OrderShipmentView;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Map;

/**
 * Stand-in until the waybills ({@code order_shipments}) are ported: no order has a parcel yet. Replaced by the real
 * implementation of the delivery module and deleted at the merge.
 */
@Component
public class OrderShipmentViewPlaceholder implements OrderShipmentView {

    @Override
    public Map<String, ShipmentBrief> forOrders(Collection<byte[]> orderIds) {
        return Map.of();
    }
}
