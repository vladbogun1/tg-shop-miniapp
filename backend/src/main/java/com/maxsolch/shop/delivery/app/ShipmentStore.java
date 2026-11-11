package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.Prepared.NpResult;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import org.springframework.dao.OptimisticLockingFailureException;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Our rows of waybills after Nova Poshta answered: each write is its own short transaction (no NP call inside it).
 * The order's tracking number follows the waybill through {@link ShipmentOrders}.
 */
@Slf4j
@Component
class ShipmentStore {

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final NpWaybillWriter writer;
    private final TransactionTemplate tx;
    private final Clock clock;

    ShipmentStore(OrderShipmentRepository shipments, ShipmentOrders orders, NpWaybillWriter writer,
                  TransactionTemplate tx, Clock clock) {
        this.shipments = shipments;
        this.orders = orders;
        this.writer = writer;
        this.tx = tx;
        this.clock = clock;
    }

    /**
     * Saves the waybill NP made: one retry; still failing, the order is marked uncertain so the next «Створити ТТН»
     * finds it at NP by the order number instead of making another.
     */
    OrderShipment persistSafely(byte[] orderId, Prepared p, NpResult r, Long estimate) {
        RuntimeException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                return tx.execute(t -> persist(orderId, p, r, estimate));
            } catch (RuntimeException e) {
                last = e;
                log.warn("Saving NP waybill {} of order {} failed (attempt {}): {}", r.number(), p.shortId(),
                        attempt + 1, e.getMessage());
            }
        }
        if (!DryRunLabels.isDry(r.number())) {
            writer.markUncertain(p.orderId());
        }
        log.error("NP waybill {} of order {} exists at NP but is not saved", r.number(), p.shortId(), last);
        throw new DomainException.BadRequest(DeliveryError.NP_NOT_SAVED, "ТТН " + r.number()
                + " создана в Новой почте, но не сохранилась в заказе — нажмите «Создать ТТН» ещё раз: найдём её "
                + "по номеру заказа, вторая не создастся");
    }

    private OrderShipment persist(byte[] orderId, Prepared p, NpResult r, Long estimate) {
        List<OrderShipment> old = shipments.findByOrderIdInAndActiveTrue(List.of(orderId));
        old.forEach(x -> x.setActive(false));
        // One active waybill per order (unique key): the old rows must be off before the insert.
        shipments.saveAllAndFlush(old);
        OrderShipment s = new OrderShipment();
        s.setOrderId(orderId);
        s.setOrigin(OrderShipment.ORIGIN_API);
        s.setStage(ShipmentStage.CREATED.name());
        fill(s, p, r, estimate);
        shipments.save(s);
        // The waybill exists at NP either way; the order mirrors it while it waits to be sent.
        boolean open = OrderStatus.NEW.name().equals(p.status()) || OrderStatus.APPROVED.name().equals(p.status());
        String current = orders.find(orderId).map(o -> o.trackingNumber()).orElse(null);
        if (open || current == null || current.isBlank()) {
            orders.setTrackingNumber(orderId, r.number());
        }
        return s;
    }

    /**
     * The same waybill after an «update» at NP, re-read now. It was not printed when the update was sent (a printed
     * one is remade instead), so a print recorded meanwhile came after NP took the new data: it is kept, and the
     * next change goes through «Перестворити». A concurrent write (poll, webhook, print) makes it try again on the
     * fresh row ({@code version}).
     */
    OrderShipment refill(byte[] shipmentId, Prepared p, NpResult r, Long estimate) {
        return retryingOnConflict(() -> tx.execute(t -> {
            OrderShipment x = shipments.findById(shipmentId).orElseThrow();
            Instant printedMeanwhile = x.getPrintedAt();
            fill(x, p, r, estimate);
            if (printedMeanwhile != null) {
                x.setPrintedAt(printedMeanwhile);
            }
            return x;
        }));
    }

    /** Three tries of a short write that lost an optimistic-lock race to the poll or a webhook. */
    private <T> T retryingOnConflict(Supplier<T> write) {
        for (int attempt = 1; ; attempt++) {
            try {
                return write.get();
            } catch (OptimisticLockingFailureException e) {
                if (attempt >= 3) {
                    throw e;
                }
                log.info("NP waybill row changed meanwhile, writing again (attempt {})", attempt + 1);
            }
        }
    }

    private void fill(OrderShipment s, Prepared p, NpResult r, Long estimate) {
        s.setSenderWarehouseRef(p.from() == null ? null : p.from().ref());
        s.setCollectCod(p.collectCod());
        s.setCargoType(p.parcel().cargoType());
        s.setEstimateMinor(estimate);
        s.setTtn(r.number());
        s.setNpRef(r.ref());
        s.setServiceType(p.service().name());
        s.setWeightG(p.parcel().weightG());
        s.setLengthMm(p.parcel().lengthMm());
        s.setWidthMm(p.parcel().widthMm());
        s.setHeightMm(p.parcel().heightMm());
        s.setDeclaredMinor(p.declaredMinor());
        s.setCodMinor(p.collectCod() ? p.codMinor() : 0);
        s.setPayerType("Recipient");
        s.setDeliveryCostMinor(r.costMinor());
        s.setScheduledDelivery(r.estimatedDelivery());
        s.setLastEventAt(clock.instant());
        s.setPollError(null);
        s.setGoodsKey(p.goodsKey());
        s.setRecipientKey(p.recipientKey());
        s.setSyncError(null);
        // NP took new data, so nothing of it is printed yet: an old label is no longer this waybill's.
        s.setPrintedAt(null);
    }

    /** The waybill is gone (deleted at NP or forgotten): history only. */
    void deactivate(byte[] shipmentId) {
        change(shipmentId, x -> {
            x.setActive(false);
            if (OrderShipment.ORIGIN_API.equals(x.getOrigin())) {
                x.setStage(ShipmentStage.CANCELLED.name());
            }
        });
    }

    /** The order no longer carries this number while it waits to be sent. */
    void clearTracking(byte[] orderId, String ttn) {
        orders.find(orderId).ifPresent(o -> {
            boolean open = o.status() == OrderStatus.NEW || o.status() == OrderStatus.APPROVED;
            if (open && ttn.equals(o.trackingNumber())) {
                orders.setTrackingNumber(orderId, null);
            }
        });
    }

    /** The order's number follows a remade waybill. */
    void replaceTracking(byte[] orderId, String oldTtn, String newTtn) {
        orders.find(orderId).ifPresent(o -> {
            if (oldTtn.equals(o.trackingNumber())) {
                orders.setTrackingNumber(orderId, newTtn);
            }
        });
    }

    /** One short write per waybill, so a poll racing one of them does not lose the print of the others. */
    void markPrinted(List<byte[]> shipmentIds) {
        shipmentIds.forEach(this::printedNow);
    }

    void syncError(byte[] shipmentId, String text) {
        change(shipmentId, x -> x.setSyncError(NpJson.cut(text, 500)));
    }

    void printedNow(byte[] shipmentId) {
        change(shipmentId, x -> x.setPrintedAt(clock.instant()));
    }

    /** Re-read and change one row; a concurrent write (version) makes it re-read and change again. */
    private void change(byte[] shipmentId, Consumer<OrderShipment> how) {
        retryingOnConflict(() -> {
            tx.executeWithoutResult(t -> shipments.findById(shipmentId).ifPresent(how));
            return null;
        });
    }
}
