package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.NpMeasure;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Applies what NP said about a waybill (poll or webhook) and then moves the order: SHIPPED once NP accepted the
 * parcel (code 4+), DELIVERED once it was picked up (what «Контроль оплати» was to collect counts as received), the
 * customer hears it arrived. Refusals and returns stay for the admin («Внимание → Посылки»). The row is saved in its
 * own transaction first and is versioned: poll and webhook may race, the loser retries once on fresh data, and an
 * event older than the last one applied does not move the stage back.
 */
@Slf4j
@Component
public class ShipmentStatusApplier {

    /** Start of the note on a typed-in waybill whose recipient is not our customer («Внимание» reads it). */
    public static final String FOREIGN_PARCEL = "Получатель ТТН не совпадает с заказом";

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final SettingsService settings;
    private final ShipmentNotifier notifier;
    private final NpAlerts alerts;
    private final TransactionTemplate tx;
    private final Clock clock;

    ShipmentStatusApplier(OrderShipmentRepository shipments, ShipmentOrders orders, SettingsService settings,
                          ShipmentNotifier notifier, NpAlerts alerts, TransactionTemplate tx, Clock clock) {
        this.shipments = shipments;
        this.orders = orders;
        this.settings = settings;
        this.notifier = notifier;
        this.alerts = alerts;
        this.tx = tx;
        this.clock = clock;
    }

    /**
     * What NP said about one waybill. {@code recipientPhone}: the phone NP shows for the recipient (only when the
     * phone we asked with matched); null = not shown. {@code at}: when it happened (webhook), null = now (poll).
     * {@code collectedMinor}: «Контроль оплати» NP shows (poll only, null = not shown); at pickup, what it collected.
     */
    public record StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                               String returnTtn, Instant at, String recipientPhone, NpMeasure measure,
                               Long collectedMinor) {

        public StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                            String returnTtn, Instant at, String recipientPhone, NpMeasure measure) {
            this(code, text, scheduledDelivery, storagePaidFrom, returnTtn, at, recipientPhone, measure, null);
        }

        public StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                            String returnTtn, Instant at, String recipientPhone) {
            this(code, text, scheduledDelivery, storagePaidFrom, returnTtn, at, recipientPhone, NpMeasure.NONE);
        }

        public StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                            String returnTtn, Instant at) {
            this(code, text, scheduledDelivery, storagePaidFrom, returnTtn, at, null);
        }
    }

    /**
     * What to do after the row is saved: move the order, tell the customer it arrived; {@code dropped} — the
     * waybill was deleted in the NP cabinet before sending, the order no longer carries its number; {@code hold} —
     * picked up, but NP did not confirm all the money collected: the order stays SHIPPED for the admin.
     */
    private record Effects(byte[] orderId, String ttn, ShipmentStage stage, boolean arrivedFirst, boolean move,
                           long codMinor, boolean dropped, boolean hold) {

        Effects(byte[] orderId, String ttn, ShipmentStage stage, boolean arrivedFirst, boolean move, long codMinor) {
            this(orderId, ttn, stage, arrivedFirst, move, codMinor, false, false);
        }
    }

    /** @param polled true from the poll (stamps {@code last_polled_at}) */
    public void apply(byte[] shipmentId, StatusUpdate u, boolean polled) {
        Effects fx;
        try {
            fx = tx.execute(t -> applyRow(shipmentId, u, polled));
        } catch (OptimisticLockingFailureException e) {
            fx = tx.execute(t -> applyRow(shipmentId, u, polled));
        }
        if (fx == null) {
            return;
        }
        Effects done = fx;
        if (done.dropped()) {
            dropTracking(done.orderId(), done.ttn());
            return;
        }
        if (done.move()) {
            moveOrder(done.orderId(), done.ttn(), done.stage(), done.codMinor(), done.hold());
        }
        if (done.arrivedFirst()) {
            orders.find(done.orderId()).filter(o -> o.status() != OrderStatus.REJECTED)
                    .ifPresent(o -> notifier.parcelArrived(o, done.ttn(), whereLabel(o), done.codMinor()));
        }
    }

    private Effects applyRow(byte[] shipmentId, StatusUpdate u, boolean polled) {
        Instant now = clock.instant();
        OrderShipment s = shipments.findById(shipmentId).orElse(null);
        if (s == null) {
            return null;
        }
        if (polled) {
            s.setLastPolledAt(now);
        }
        s.setPollError(null);
        if (u.at() != null && s.getLastEventAt() != null && u.at().isBefore(s.getLastEventAt())) {
            return null; // a late webhook (or a replay) older than what we already have
        }
        ShipmentStage old = s.stageEnum();
        ShipmentStage next = ShipmentStatusMapper.stageOf(u.code(),
                ShipmentStatusMapper.parseOverrides(settings.getString(DeliverySettings.NP_STATUS_OVERRIDES)));
        copyFields(s, u);
        if (next == ShipmentStage.RECEIVED && u.collectedMinor() != null) {
            // Only at pickup it is what NP collected; before that it is the amount still to collect.
            s.setNpCollectedMinor(u.collectedMinor());
        }
        if (NpMeasure.accepted(u.code())) {
            // NP's re-measure at the branch: kept apart, our declared weight, sides and price stay as sent.
            s.recordNpMeasure(u.measure(), now);
        }
        if (next == null) {
            unknownCode(s.getTtn(), u.code(), u.text());
            return null;
        }
        if (old.terminal() && next != old) {
            return null; // RECEIVED / CANCELLED are final: a late or replayed event does not reopen them
        }
        if (next != old) {
            Instant at = u.at() != null ? u.at() : now;
            s.setStage(next.name());
            s.setLastEventAt(at);
            if (next == ShipmentStage.ARRIVED && s.getArrivedAt() == null) {
                s.setArrivedAt(at);
            }
            if (next == ShipmentStage.RECEIVED) {
                s.setReceivedAt(at);
            }
        }
        if (next == ShipmentStage.CANCELLED && old != next && OrderShipment.ORIGIN_API.equals(s.getOrigin())
                && orderOpen(s.getOrderId())) {
            // Deleted in the NP cabinet before it was sent (#e90378e3, 13.11.2026): history only, like our own
            // «Отменить ТТН» — otherwise the order is stuck with a dead waybill and no button to make a new one.
            s.setActive(false);
            log.info("NP waybill {} was deleted at NP before sending: dropped from its order", s.getTtn());
            return new Effects(s.getOrderId(), s.getTtn(), next, false, false, 0, true, false);
        }
        if (s.isQuiet()) {
            // Backfilled: the first status only catches up — no message, no reminder. One exception: a parcel the
            // customer already picked up closes its order when nothing is owed on it (no money to book); one with
            // money still owed stays for the admin on «Внимание» (RECEIVED_SHIPPED), since RECEIVED is final.
            s.setQuiet(false);
            s.setArrivalNotifiedAt(s.getArrivalNotifiedAt() == null ? now : s.getArrivalNotifiedAt());
            s.setStorageNotifiedAt(s.getStorageNotifiedAt() == null ? now : s.getStorageNotifiedAt());
            // Backfilled numbers were typed in by hand: only our recipient's parcel moves the order.
            boolean pickedUpPaid = next == ShipmentStage.RECEIVED && orders.find(s.getOrderId())
                    .filter(o -> o.codMinor() == 0 && o.amountDueMinor() == 0).isPresent()
                    && ourRecipient(s, next, u, polled);
            return pickedUpPaid ? new Effects(s.getOrderId(), s.getTtn(), next, false, true, 0) : null;
        }
        boolean move = ourRecipient(s, next, u, polled);
        boolean arrivedFirst = move && next == ShipmentStage.ARRIVED && s.getArrivalNotifiedAt() == null
                && settings.getBool(DeliverySettings.NP_NOTIFY_ARRIVAL);
        if (arrivedFirst) {
            s.setArrivalNotifiedAt(now);
        }
        if (next != ShipmentStage.RECEIVED) {
            return new Effects(s.getOrderId(), s.getTtn(), next, arrivedFirst, move,
                    s.collects() ? s.getCodMinor() : 0, false, false);
        }
        // Only this very report can confirm the money: a stored amount may be older than the pickup.
        long owes = orders.find(s.getOrderId()).map(ShippingOrder::codMinor).orElse(s.getCodMinor());
        return new Effects(s.getOrderId(), s.getTtn(), next, arrivedFirst, move, s.collectDueMinor(owes), false,
                !s.pickupSettles(u.collectedMinor(), owes));
    }

    private static void copyFields(OrderShipment s, StatusUpdate u) {
        if (u.code() != null) {
            s.setStatusCode(NpJson.cut(u.code().trim(), 8));
        }
        if (u.text() != null && !keepsReason(s.getStatusText(), u.text())) {
            s.setStatusText(NpJson.cut(u.text(), 255));
        }
        if (u.scheduledDelivery() != null) {
            s.setScheduledDelivery(u.scheduledDelivery());
        }
        if (u.storagePaidFrom() != null) {
            s.setStoragePaidFrom(u.storagePaidFrom());
        }
        if (u.returnTtn() != null) {
            s.setReturnTtn(NpJson.cut(u.returnTtn(), 32));
        }
    }

    /**
     * The webhook names the status only; the poll adds NP's reason («… · Одержувач не з'явився …»): the same status
     * from the webhook keeps that reason (it decides «не забрал» vs «отказ» on «Внимание»).
     */
    static boolean keepsReason(String stored, String incoming) {
        return stored != null && !incoming.isBlank() && stored.startsWith(incoming.trim() + " · ");
    }

    /**
     * A typed-in number may be another person's parcel: the order moves only when NP shows our recipient's phone for
     * it. A webhook carries no phone: the next poll decides.
     */
    private boolean ourRecipient(OrderShipment s, ShipmentStage next, StatusUpdate u, boolean polled) {
        if (!OrderShipment.ORIGIN_MANUAL.equals(s.getOrigin()) || !ShipmentStatusMapper.handedOver(next)) {
            return true;
        }
        String phone = orders.find(s.getOrderId()).map(ShippingOrder::phone).orElse(null);
        if (samePhone(u.recipientPhone(), phone)) {
            return true;
        }
        if (polled) {
            s.setPollError(FOREIGN_PARCEL + " (или Новая почта его не показала) — проверьте номер ТТН; "
                    + "заказ сам не переводится");
        }
        return false;
    }

    /** Same Ukrainian number: the last 9 digits (NP shows 380…, orders hold +380…, 0…). */
    static boolean samePhone(String a, String b) {
        String x = a == null ? "" : a.replaceAll("\\D", "");
        String y = b == null ? "" : b.replaceAll("\\D", "");
        return x.length() >= 9 && y.length() >= 9 && x.substring(x.length() - 9).equals(y.substring(y.length() - 9));
    }

    /** An unknown code keeps the stage; it is listed on «Внимание» so a mapping can be added. */
    private void unknownCode(String ttn, String code, String text) {
        log.info("NP waybill {}: unknown status code {} ({}) — stage kept", ttn, code, text);
        if (code == null || code.isBlank()) {
            return;
        }
        String key = NpJson.cut(code.trim(), 8) + (text == null || text.isBlank() ? ""
                : " «" + NpJson.cut(text.trim(), 60) + "»");
        String head = "Новая почта прислала статусы, которых нет в таблице: ";
        String tail = " — стадия посылок не меняется. Привяжите коды в «Настройки» → «Доставка» → «Отслеживание» → «Свои коды статусов».";
        String known = alerts.get(NpAlerts.Kind.STATUS_CODES).map(NpAlerts.Alert::text)
                .filter(t -> t.startsWith(head) && t.endsWith(tail))
                .map(t -> t.substring(head.length(), t.length() - tail.length())).orElse("");
        if (!known.contains(key)) {
            alerts.raise(NpAlerts.Kind.STATUS_CODES, head + (known.isEmpty() ? key : known + "; " + key) + tail);
        }
    }

    private boolean orderOpen(byte[] orderId) {
        return orders.find(orderId).filter(o -> o.status() == OrderStatus.NEW || o.status() == OrderStatus.APPROVED)
                .isPresent();
    }

    /** The open order no longer carries the deleted number (a typed one would be tracked again). */
    private void dropTracking(byte[] orderId, String ttn) {
        orders.find(orderId).filter(o -> ttn.equals(o.trackingNumber()))
                .ifPresent(o -> orders.setTrackingNumber(orderId, null));
    }

    /**
     * SHIPPED once NP accepted the parcel, DELIVERED once it was picked up (both switchable); {@code hold} — picked
     * up without NP confirming all the money: not DELIVERED, «Внимание» shows it.
     */
    void moveOrder(byte[] orderId, String ttn, ShipmentStage stage, long collectedMinor, boolean hold) {
        try {
            if (ShipmentStatusMapper.handedOver(stage) && settings.getBool(DeliverySettings.NP_SHIP_ON_ACCEPT)) {
                // The parcel is physically gone: shipped even if the prepayment is still missing.
                orders.markShipped(orderId, ttn);
            }
            if (stage == ShipmentStage.RECEIVED && hold) {
                log.info("Order {} picked up ({}) but NP did not confirm all {} collected: left for the admin",
                        UuidUtil.toString(orderId), ttn, collectedMinor);
            } else if (stage == ShipmentStage.RECEIVED && settings.getBool(DeliverySettings.NP_AUTO_DELIVER)) {
                // What «Контроль оплати» collected, not the whole total.
                orders.markDelivered(orderId, collectedMinor);
            }
        } catch (RuntimeException e) {
            log.info("Order {} not moved by NP status {} of {}: {}", UuidUtil.toString(orderId), stage, ttn,
                    e.getMessage());
        }
    }

    static String whereLabel(ShippingOrder o) {
        String wh = o.warehouseName();
        String city = o.cityName();
        if (wh == null || wh.isBlank()) {
            return city == null ? "" : city;
        }
        return city == null || city.isBlank() ? wh : city + ", " + wh;
    }
}
