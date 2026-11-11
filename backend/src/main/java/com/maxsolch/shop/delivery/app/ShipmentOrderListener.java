package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;

/**
 * What an order change does to its waybill, after the order's transaction committed. Calls to NP take seconds, so
 * the work runs on one background thread ({@code np-shipments}) in the order the events came:
 * <ul>
 *   <li>a typed-in number becomes a tracked waybill; a cleared one leaves the old as history;</li>
 *   <li>approved NP order → the waybill is made automatically (setting, off in code);</li>
 *   <li>rejected, archived, merged into another, exchanged back to the queue → our waybill NP has no parcel for is
 *       deleted there (a failure goes to «Внимание»); one NP already has is never touched;</li>
 *   <li>goods, discount, recipient or payment changed (also the merge target) → the waybill is updated at NP or
 *       shown as «ТТН устарела» ({@link ShipmentEditing#syncWithOrder}).</li>
 * </ul>
 */
@Slf4j
@Component
class ShipmentOrderListener {

    private final ShipmentOrders orders;
    private final ShipmentManualSync manual;
    private final ShipmentBatch batch;
    private final ShipmentCancellation cancellation;
    private final ShipmentEditing editing;
    private final ExecutorService worker;

    ShipmentOrderListener(ShipmentOrders orders, ShipmentManualSync manual, ShipmentBatch batch,
                          ShipmentCancellation cancellation, ShipmentEditing editing, Workers workers) {
        this.orders = orders;
        this.manual = manual;
        this.batch = batch;
        this.cancellation = cancellation;
        this.editing = editing;
        this.worker = workers.single("np-shipments");
    }

    @OnCommitted
    public void onStatus(OrderEvents.StatusChanged e) {
        run(e.orderId(), "status", () -> {
            manual.sync(e.orderId());
            ShippingOrder o = orders.find(e.orderId()).orElse(null);
            if (o == null) {
                return;
            }
            if (o.status() == OrderStatus.REJECTED) {
                cancellation.dropForClosedOrder(e.orderId());
            } else if (o.status() == OrderStatus.APPROVED && o.deliveryMethod() == DeliveryMethod.NOVA_POSHTA) {
                batch.autoCreate(e.orderId());
            }
        });
    }

    @OnCommitted
    public void onEdited(OrderEvents.Edited e) {
        switch (e.kind()) {
            case TRACKING -> run(e.orderId(), "tracking", () -> manual.sync(e.orderId()));
            case COMPOSITION, GIFT, DISCOUNT, SILENT, DETAILS ->
                    run(e.orderId(), "edit", () -> editing.syncWithOrder(e.orderId()));
            default -> {
                // a gift case changes neither the parcel nor the money on it
            }
        }
    }

    @OnCommitted
    public void onPayment(OrderEvents.PaymentReceived e) {
        run(e.orderId(), "payment", () -> editing.syncWithOrder(e.orderId()));
    }

    @OnCommitted
    public void onExchanged(OrderEvents.Exchanged e) {
        run(e.orderId(), "exchange", () -> {
            manual.sync(e.orderId());
            boolean cleared = orders.find(e.orderId())
                    .map(o -> o.trackingNumber() == null || o.trackingNumber().isBlank()).orElse(false);
            if (cleared) {
                cancellation.dropForClosedOrder(e.orderId());
            }
        });
    }

    @OnCommitted
    public void onArchived(OrderEvents.Archived e) {
        run(e.orderId(), "archive", () -> cancellation.dropForClosedOrder(e.orderId()));
    }

    @OnCommitted
    public void onMerged(OrderEvents.Merged e) {
        run(e.sourceId(), "merge source", () -> cancellation.dropForClosedOrder(e.sourceId()));
        run(e.targetId(), "merge target", () -> editing.syncWithOrder(e.targetId()));
    }

    private void run(byte[] orderId, String what, Runnable work) {
        try {
            worker.execute(() -> {
                try {
                    work.run();
                } catch (RuntimeException ex) {
                    log.warn("NP waybill of order {} not synced after {}: {}", UuidUtil.toString(orderId), what,
                            ex.getMessage());
                }
            });
        } catch (RejectedExecutionException ex) {
            log.warn("NP waybill sync of order {} after {} skipped: shutting down", UuidUtil.toString(orderId), what);
        }
    }
}
