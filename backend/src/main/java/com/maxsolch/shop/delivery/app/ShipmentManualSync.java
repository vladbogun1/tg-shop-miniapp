package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

/**
 * A number the admin typed into the order («ТТН» field, or shipping by hand) becomes a {@code MANUAL} waybill row,
 * so it is tracked like ours; a cleared number (an exchange sent the order back to the queue) leaves the old waybill
 * as history. Ours that NP has no parcel for stays active: {@link ShipmentCancellation#dropForClosedOrder} deletes
 * it at NP first. When another number replaces ours that NP has no parcel for, ours is deleted at NP first (under the
 * order's lock); if NP does not delete it, it stays active with {@code sync_error} («Внимание») and the typed number
 * waits; a busy lock leaves the swap to {@link ShipmentCleanupSweep}.
 */
@Slf4j
@Component
class ShipmentManualSync {

    static final String REPLACED = "Введена другая ТТН, а эта не удалилась в Новой почте — удалите её в кабинете НП: ";

    private final ShipmentOrders orders;
    private final OrderShipmentRepository shipments;
    private final TransactionTemplate tx;
    private final ShipmentLocks locks;
    private final ShipmentCancellation cancellation;

    ShipmentManualSync(ShipmentOrders orders, OrderShipmentRepository shipments, TransactionTemplate tx,
                       ShipmentLocks locks, ShipmentCancellation cancellation) {
        this.orders = orders;
        this.shipments = shipments;
        this.tx = tx;
        this.locks = locks;
        this.cancellation = cancellation;
    }

    void sync(byte[] orderId) {
        ShippingOrder order = orders.find(orderId).orElse(null);
        if (order == null || order.deliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
            return;
        }
        String ttn = typed(order);
        if (ttn == null || replaced(order.id(), ttn) == null) {
            tx.executeWithoutResult(t -> apply(order, ttn));
            return;
        }
        if (locks.tryWithOrder(orderId, () -> swapLocked(order, ttn)).isEmpty()) {
            log.info("NP waybill of order {}: the lock is busy, the typed number waits for the next tick",
                    order.shortId());
        }
    }

    /** The order's number without spaces; null when blank. */
    static String typed(ShippingOrder order) {
        String ttn = order.trackingNumber() == null ? null : order.trackingNumber().replaceAll("\\s+", "");
        return ttn == null || ttn.isEmpty() ? null : ttn;
    }

    /** Our active waybill NP has no parcel for, other than {@code ttn}: deleted at NP before the swap. */
    private OrderShipment replaced(byte[] orderId, String ttn) {
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).orElse(null);
        return ShipmentCancellation.deletableAtNp(s) && !ttn.equals(s.getTtn()) ? s : null;
    }

    private boolean swapLocked(ShippingOrder order, String ttn) {
        OrderShipment ours = replaced(order.id(), ttn);
        if (ours != null && !cancellation.replaceLocked(order.id(), ours, REPLACED)) {
            return true;
        }
        tx.executeWithoutResult(t -> apply(order, ttn));
        return true;
    }

    private void apply(ShippingOrder order, String ttn) {
        List<OrderShipment> active = shipments.findByOrderIdInAndActiveTrue(List.of(order.id()));
        if (ttn == null) {
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
