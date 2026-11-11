package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/**
 * A number the admin typed into the order («ТТН» field, or shipping by hand) becomes a {@code MANUAL} waybill row,
 * so it is tracked like ours; a cleared number (an exchange sent the order back to the queue) leaves the old waybill
 * as history. Ours that NP has no parcel for stays active: {@link ShipmentCancellation#dropForClosedOrder} deletes
 * it at NP first.
 */
@Component
class ShipmentManualSync {

    private final ShipmentOrders orders;
    private final OrderShipmentRepository shipments;
    private final TransactionTemplate tx;

    ShipmentManualSync(ShipmentOrders orders, OrderShipmentRepository shipments, TransactionTemplate tx) {
        this.orders = orders;
        this.shipments = shipments;
        this.tx = tx;
    }

    void sync(byte[] orderId) {
        ShippingOrder order = orders.find(orderId).orElse(null);
        if (order == null || order.deliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
            return;
        }
        String ttn = order.trackingNumber() == null ? null : order.trackingNumber().replaceAll("\\s+", "");
        tx.executeWithoutResult(t -> apply(order, ttn));
    }

    private void apply(ShippingOrder order, String ttn) {
        List<OrderShipment> active = shipments.findByOrderIdInAndActiveTrue(List.of(order.id()));
        if (ttn == null || ttn.isEmpty()) {
            active.stream().filter(s -> !deletableAtNp(s)).forEach(s -> s.setActive(false));
            return;
        }
        if (active.stream().anyMatch(s -> ttn.equals(s.getTtn()))) {
            return;
        }
        active.forEach(s -> s.setActive(false));
        // One active waybill per order (unique key): the old rows must be off before the insert.
        shipments.saveAllAndFlush(active);
        OrderShipment s = new OrderShipment();
        s.setOrderId(order.id());
        s.setOrigin(OrderShipment.ORIGIN_MANUAL);
        s.setTtn(NpJson.cut(ttn, 32));
        s.setServiceType(order.serviceType() == null ? null : order.serviceType().name());
        s.setStage(ShipmentStage.CREATED.name());
        s.setCodMinor(order.codMinor());
        shipments.save(s);
    }

    static boolean deletableAtNp(OrderShipment s) {
        ShipmentStage st = s.stageEnum();
        return OrderShipment.ORIGIN_API.equals(s.getOrigin())
                && (st == ShipmentStage.CREATED || st == ShipmentStage.NOT_FOUND);
    }
}
