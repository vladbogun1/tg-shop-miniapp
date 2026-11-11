package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The clean-ups an order event could not do because another waybill action held the order's lock, retried on the
 * tracking tick ({@link ShipmentJobs}): our waybill NP has no parcel for, still active, without {@code sync_error}
 * (a real failure waits for a person), while
 * <ul>
 *   <li>the order is rejected (merged away included) or archived → deleted at NP
 *       ({@link ShipmentCancellation#dropForClosedOrder});</li>
 *   <li>the order carries another typed-in number → the swap of {@link ShipmentManualSync}.</li>
 * </ul>
 * An exchange that cleared the number is not retried here: an admin clearing the field looks the same.
 */
@Slf4j
@Component
class ShipmentCleanupSweep {

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final ShipmentCancellation cancellation;
    private final ShipmentManualSync manual;

    ShipmentCleanupSweep(OrderShipmentRepository shipments, ShipmentOrders orders, ShipmentCancellation cancellation,
                         ShipmentManualSync manual) {
        this.shipments = shipments;
        this.orders = orders;
        this.cancellation = cancellation;
        this.manual = manual;
    }

    /** @return how many waybills were looked at again */
    int run() {
        List<OrderShipment> ours = shipments.findActiveInStages(List.of(ShipmentStage.CREATED.name())).stream()
                .filter(ShipmentCancellation::deletableAtNp)
                .filter(s -> s.getSyncError() == null || s.getSyncError().isBlank())
                .toList();
        if (ours.isEmpty()) {
            return 0;
        }
        Map<String, ShippingOrder> byId = new HashMap<>();
        orders.findAll(ours.stream().map(OrderShipment::getOrderId).toList())
                .forEach(o -> byId.put(UuidUtil.toString(o.id()), o));
        int n = 0;
        for (OrderShipment s : ours) {
            ShippingOrder o = byId.get(UuidUtil.toString(s.getOrderId()));
            Action a = o == null ? Action.NONE : action(s, o);
            if (a == Action.NONE) {
                continue;
            }
            try {
                if (a == Action.DROP) {
                    cancellation.dropForClosedOrder(o.id());
                } else {
                    manual.sync(o.id());
                }
                n++;
            } catch (RuntimeException e) {
                log.warn("NP waybill {} clean-up retry failed: {}", s.getTtn(), e.getMessage());
            }
        }
        return n;
    }

    enum Action { NONE, DROP, SWAP }

    /** What is left to do with our not-handed-over waybill {@code s} of order {@code o}. */
    static Action action(OrderShipment s, ShippingOrder o) {
        if (o.status() == OrderStatus.REJECTED || o.archived()) {
            return Action.DROP;
        }
        String typed = ShipmentManualSync.typed(o);
        return typed != null && !typed.equals(s.getTtn()) ? Action.SWAP : Action.NONE;
    }
}
