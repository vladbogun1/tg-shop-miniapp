package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.platform.error.DomainException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * «Скасувати ТТН» and the clean-up when an order closes. Our waybill is deleted at NP only before NP has the parcel;
 * a typed-in one is only forgotten here. The order's tracking number is cleared while it is not shipped yet.
 */
@Slf4j
@Service
public class ShipmentCancellation {

    static final String CLOSED_ORDER = "Заказ закрыт, ТТН не удалилась в Новой почте — удалите её в кабинете НП: ";

    private final OrderShipmentRepository shipments;
    private final NpWaybillWriter writer;
    private final ShipmentStore store;
    private final ShipmentLocks locks;

    ShipmentCancellation(OrderShipmentRepository shipments, NpWaybillWriter writer, ShipmentStore store,
                         ShipmentLocks locks) {
        this.shipments = shipments;
        this.writer = writer;
        this.store = store;
        this.locks = locks;
    }

    public void cancel(byte[] orderId) {
        locks.withOrder(orderId, () -> {
            OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId)
                    .orElseThrow(() -> new DomainException.NotFound(DeliveryError.NP_NO_SHIPMENT));
            if (OrderShipment.ORIGIN_API.equals(s.getOrigin())) {
                ShipmentPreparation.editable(s);
            }
            forget(orderId, s);
            return null;
        });
    }

    /** Deletes our waybill at NP (not under a dry run) and keeps the row as history. Call under the lock. */
    private void forget(byte[] orderId, OrderShipment s) {
        if (OrderShipment.ORIGIN_API.equals(s.getOrigin())) {
            if (writer.dryRun() || DryRunLabels.isDry(s.getTtn())) {
                log.info("NP waybill {} is only forgotten here, not deleted at NP (dry run)", s.getTtn());
            } else {
                writer.delete(s.getNpRef(), s.getTtn(), "Отменить ТТН");
            }
        }
        store.deactivate(s.getId());
        store.clearTracking(orderId, s.getTtn());
        log.info("NP waybill {} cancelled", s.getTtn());
    }

    /**
     * The order was rejected, cancelled, archived, merged into another or exchanged: our waybill NP has no parcel for
     * (CREATED, made with our key) is deleted there. A typed-in one or one NP already has stays. A failure is kept
     * in {@code sync_error}, so «Внимание» → «Посылки» shows the waybill to delete by hand. While another waybill
     * action holds the order's lock nothing is written: {@link ShipmentCleanupSweep} tries again on the next tick
     * (and a waybill still being made re-checks the order itself when it is saved).
     */
    public void dropForClosedOrder(byte[] orderId) {
        if (locks.tryWithOrder(orderId, () -> dropLocked(orderId)).isEmpty()) {
            log.info("NP waybill of closed order: the order's lock is busy, the next tracking tick retries");
        }
    }

    /** {@link #dropForClosedOrder} for a caller already holding the order's lock (the lock is not re-entrant). */
    boolean dropLocked(byte[] orderId) {
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).orElse(null);
        if (deletableAtNp(s)) {
            replaceLocked(orderId, s, CLOSED_ORDER);
        }
        return true;
    }

    /**
     * Deletes our waybill {@code s} at NP before the order goes on without it (closed, or another number typed in);
     * under the lock. False when NP did not delete it: the row stays active with {@code sync_error}.
     */
    boolean replaceLocked(byte[] orderId, OrderShipment s, String failurePrefix) {
        try {
            forget(orderId, s);
            return true;
        } catch (RuntimeException e) {
            log.warn("NP waybill {} not deleted: {}", s.getTtn(), ShipmentEditing.reason(e));
            store.syncError(s.getId(), failurePrefix + ShipmentEditing.reason(e));
            return false;
        }
    }

    /** Ours, and NP has no parcel yet: the only kind deleted at NP without asking. */
    static boolean deletableAtNp(OrderShipment s) {
        return s != null && OrderShipment.ORIGIN_API.equals(s.getOrigin()) && s.stageEnum() == ShipmentStage.CREATED;
    }
}
