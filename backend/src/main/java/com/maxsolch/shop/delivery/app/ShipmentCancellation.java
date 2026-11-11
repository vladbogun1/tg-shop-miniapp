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
            cancelLocked(orderId);
            return null;
        });
    }

    private void cancelLocked(byte[] orderId) {
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> new DomainException.NotFound(DeliveryError.NP_NO_SHIPMENT));
        if (OrderShipment.ORIGIN_API.equals(s.getOrigin())) {
            ShipmentPreparation.editable(s);
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
     * in {@code sync_error}, so «Внимание» → «Посылки» shows the waybill to delete by hand.
     */
    public void dropForClosedOrder(byte[] orderId) {
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).orElse(null);
        if (s == null || !OrderShipment.ORIGIN_API.equals(s.getOrigin()) || s.stageEnum() != ShipmentStage.CREATED) {
            return;
        }
        try {
            cancel(orderId);
        } catch (RuntimeException e) {
            log.warn("NP waybill {} of a closed order not deleted: {}", s.getTtn(), ShipmentEditing.reason(e));
            store.syncError(s.getId(), "Заказ закрыт, ТТН не удалилась в Новой почте — удалите её в кабинете НП: "
                    + ShipmentEditing.reason(e));
        }
    }
}
