package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NpJson;
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
     */
    public record StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                               String returnTtn, Instant at, String recipientPhone) {

        public StatusUpdate(String code, String text, LocalDate scheduledDelivery, LocalDate storagePaidFrom,
                            String returnTtn, Instant at) {
            this(code, text, scheduledDelivery, storagePaidFrom, returnTtn, at, null);
        }
    }

    /** What to do after the row is saved: move the order, tell the customer it arrived. */
    private record Effects(byte[] orderId, String ttn, ShipmentStage stage, boolean arrivedFirst, boolean move,
                           long codMinor) {
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
        if (done.move()) {
            moveOrder(done.orderId(), done.ttn(), done.stage(), done.codMinor());
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
        if (s.isQuiet()) {
            // Backfilled: the first status only catches up — no message, no order transition, no reminder.
            s.setQuiet(false);
            s.setArrivalNotifiedAt(s.getArrivalNotifiedAt() == null ? now : s.getArrivalNotifiedAt());
            s.setStorageNotifiedAt(s.getStorageNotifiedAt() == null ? now : s.getStorageNotifiedAt());
            return null;
        }
        boolean move = ourRecipient(s, next, u, polled);
        boolean arrivedFirst = move && next == ShipmentStage.ARRIVED && s.getArrivalNotifiedAt() == null
                && settings.getBool(DeliverySettings.NP_NOTIFY_ARRIVAL);
        if (arrivedFirst) {
            s.setArrivalNotifiedAt(now);
        }
        return new Effects(s.getOrderId(), s.getTtn(), next, arrivedFirst, move, s.collects() ? s.getCodMinor() : 0);
    }

    private static void copyFields(OrderShipment s, StatusUpdate u) {
        if (u.code() != null) {
            s.setStatusCode(NpJson.cut(u.code().trim(), 8));
        }
        if (u.text() != null) {
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
        String tail = " — стадия посылок не меняется. Привяжите коды в «Настройки» → «Новая почта» → «Свои коды статусов».";
        String known = alerts.get(NpAlerts.Kind.STATUS_CODES).map(NpAlerts.Alert::text)
                .filter(t -> t.startsWith(head) && t.endsWith(tail))
                .map(t -> t.substring(head.length(), t.length() - tail.length())).orElse("");
        if (!known.contains(key)) {
            alerts.raise(NpAlerts.Kind.STATUS_CODES, head + (known.isEmpty() ? key : known + "; " + key) + tail);
        }
    }

    /** SHIPPED once NP accepted the parcel, DELIVERED once it was picked up (both switchable). */
    void moveOrder(byte[] orderId, String ttn, ShipmentStage stage, long collectedMinor) {
        try {
            if (ShipmentStatusMapper.handedOver(stage) && settings.getBool(DeliverySettings.NP_SHIP_ON_ACCEPT)) {
                // The parcel is physically gone: shipped even if the prepayment is still missing.
                orders.markShipped(orderId, ttn);
            }
            if (stage == ShipmentStage.RECEIVED && settings.getBool(DeliverySettings.NP_AUTO_DELIVER)) {
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
