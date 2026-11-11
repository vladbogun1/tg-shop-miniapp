package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.Prepared.NpResult;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * «Змінити ТТН» / «Перестворити ТТН» and keeping a waybill in step with its order. Only before NP has the parcel.
 * Not printed yet → the same number is updated at NP; printed (NP then refuses: «Document is already printed») →
 * the old waybill is deleted and a new one made, whose label has to be printed again.
 */
@Slf4j
@Service
public class ShipmentEditing {

    private final ShipmentPreparation preparation;
    private final NpWaybillWriter writer;
    private final ShipmentStore store;
    private final ShipmentLocks locks;
    private final ShipmentCreation creation;
    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final SettingsService settings;

    ShipmentEditing(ShipmentPreparation preparation, NpWaybillWriter writer, ShipmentStore store,
                    ShipmentLocks locks, ShipmentCreation creation, OrderShipmentRepository shipments,
                    ShipmentOrders orders, SettingsService settings) {
        this.preparation = preparation;
        this.writer = writer;
        this.store = store;
        this.locks = locks;
        this.creation = creation;
        this.shipments = shipments;
        this.orders = orders;
        this.settings = settings;
    }

    public OrderShipment update(byte[] orderId, Options opt) {
        return update(orderId, opt, true);
    }

    /** {@code remakeIfPrinted} false: a printed waybill is left as it is (NP's error is thrown). */
    OrderShipment update(byte[] orderId, Options opt, boolean remakeIfPrinted) {
        Options o = opt == null ? Options.defaults() : opt;
        return locks.withOrder(orderId, () -> updateLocked(orderId, o, remakeIfPrinted));
    }

    private OrderShipment updateLocked(byte[] orderId, Options o, boolean remakeIfPrinted) {
        Prepared p = preparation.prepare(orderId, o);
        OrderShipment s = ShipmentPreparation.editable(p.active());
        ShipmentPreparation.requireReady(p, o.allowingUnpaid());
        boolean printed = remakeIfPrinted && s.getPrintedAt() != null;
        NpResult r = null;
        if (!printed && (DryRunLabels.isDry(s.getTtn()) || writer.dryRun())) {
            r = new NpResult(s.getNpRef(), s.getTtn(), s.getDeliveryCostMinor(), s.getScheduledDelivery());
        } else if (!printed) {
            try {
                r = writer.save(p, s.getNpRef());
            } catch (NovaPoshtaException e) {
                if (remakeIfPrinted && NpWaybillWriter.printedAtNp(e)) {
                    // Printed in NP's cabinet, or before we kept track of printing.
                    printed = true;
                } else if (e.isUncertain()) {
                    // «update» of the same Ref is safe to repeat; the old data stays until it succeeds.
                    throw new DomainException.BadRequest(DeliveryError.NP_UNCERTAIN, "Новая почта не ответила "
                            + "вовремя — изменения ТТН " + s.getTtn() + " могли не сохраниться. Повторите «Изменить "
                            + "ТТН» или проверьте в кабинете НП");
                } else {
                    throw e;
                }
            }
        }
        if (printed) {
            return remake(orderId, p, s);
        }
        Long estimate = creation.estimateMinor(p);
        OrderShipment saved = store.refill(s.getId(), p, r, estimate);
        creation.checkTariff(p, r, estimate);
        return saved;
    }

    /**
     * A printed waybill: delete it at NP, then make a new one with the same choices (the old row stays as CANCELLED
     * history). If the new one fails, the order is left without a waybill and the admin is told to make one.
     */
    private OrderShipment remake(byte[] orderId, Prepared p, OrderShipment old) {
        boolean fakeIt = writer.dryRun() || DryRunLabels.isDry(old.getTtn());
        if (!fakeIt) {
            try {
                writer.delete(old.getNpRef(), old.getTtn(), "Перестворити ТТН");
            } catch (NovaPoshtaException e) {
                throw new DomainException.BadRequest(DeliveryError.NP_DELETE_FAILED, "Новая почта не удалила "
                        + "напечатанную ТТН " + old.getTtn() + ": " + e.reason() + " — удалите её в кабинете НП и "
                        + "создайте новую");
            }
        }
        store.deactivate(old.getId());
        NpResult r;
        try {
            r = fakeIt ? NpWaybillWriter.fake(p) : writer.saveOnce(p);
        } catch (RuntimeException e) {
            store.clearTracking(orderId, old.getTtn());
            log.warn("NP waybill {} of order {} deleted, the new one failed: {}", old.getTtn(), p.shortId(),
                    e.getMessage());
            throw new DomainException.BadRequest(DeliveryError.NP_REMAKE_FAILED, "Старая ТТН " + old.getTtn()
                    + " удалена, а новая не создалась: " + reason(e) + " — нажмите «Створити ТТН»");
        }
        log.info("NP waybill {} of order {} remade as {} (the old one was printed)", old.getTtn(), p.shortId(),
                r.number());
        Long estimate = creation.estimateMinor(p);
        OrderShipment s = store.persistSafely(orderId, p, r, estimate);
        store.replaceTracking(orderId, old.getTtn(), r.number());
        creation.checkTariff(p, r, estimate);
        return s;
    }

    /**
     * Keeps a waybill NP has no parcel for in step with its order: the money collected, the declared value and —
     * when the goods changed — weight and boxes; same sender branch, «collect» choice and cargo type. Only when the
     * waybill no longer matches the order («ТТН устарела»), so our own tracking-number writes never loop back here.
     * A printed waybill is not remade automatically: the admin sees «ТТН устарела» and decides. A failure is kept in
     * {@code sync_error} (shown on «Внимание»).
     *
     * @return true if the waybill was updated
     */
    public boolean syncWithOrder(byte[] orderId) {
        if (!settings.getBool(DeliverySettings.NP_AUTO_UPDATE_TTN)) {
            return false;
        }
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).orElse(null);
        if (s == null || !OrderShipment.ORIGIN_API.equals(s.getOrigin()) || s.stageEnum() != ShipmentStage.CREATED) {
            return false;
        }
        ShippingOrder order = orders.find(orderId).orElse(null);
        if (order == null || ShipmentFacts.staleReasons(order, s).isEmpty()) {
            return false;
        }
        if (s.getPrintedAt() != null) {
            log.info("NP waybill {} is printed: not remade automatically after the order changed", s.getTtn());
            return false;
        }
        return syncNow(orderId, s, !ShipmentFacts.goodsKey(order).equals(s.getGoodsKey()));
    }

    private boolean syncNow(byte[] orderId, OrderShipment s, boolean goodsChanged) {
        // Collect: an explicit «no» stays «no»; otherwise whatever the order still owes.
        Boolean collect = Boolean.FALSE.equals(s.getCollectCod()) ? Boolean.FALSE : null;
        Options o = new Options(s.getSenderWarehouseRef(),
                goodsChanged ? null : s.getWeightG(), goodsChanged ? null : s.getLengthMm(),
                goodsChanged ? null : s.getWidthMm(), goodsChanged ? null : s.getHeightMm(),
                null, collect, null, null, null, null, null,
                true, "Documents".equals(s.getCargoType()) ? null : Boolean.FALSE);
        try {
            update(orderId, o, false);
            log.info("NP waybill {} updated after the order changed", s.getTtn());
            return true;
        } catch (RuntimeException e) {
            log.warn("NP waybill {} not updated after the order changed: {}", s.getTtn(), reason(e));
            if (NpWaybillWriter.printedAtNp(e)) {
                store.printedNow(s.getId());
            } else {
                store.syncError(s.getId(), "ТТН не обновилась после правки заказа: " + reason(e));
            }
            return false;
        }
    }

    static String reason(RuntimeException e) {
        return e instanceof NovaPoshtaException n ? n.reason() : e.getMessage();
    }
}
