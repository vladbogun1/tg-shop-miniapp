package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.app.ShipmentStatusApplier.StatusUpdate;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.NpMeasure;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Keeps {@code order_shipments} in step with Nova Poshta by polling ({@code TrackingDocument.getStatusDocuments} in
 * batches of 100, every 30 min from {@link ShipmentJobs}); what NP says goes through
 * {@link ShipmentStatusApplier#apply}, the same as a webhook. The day before paid storage starts the customer gets
 * one reminder.
 */
@Slf4j
@Service
public class ShipmentTrackingService {

    static final int BATCH = 100;
    /** A row polled more recently than this is skipped (the job runs every 30 min). */
    static final Duration MIN_INTERVAL = Duration.ofMinutes(20);
    /** Shipments older than this are not polled any more (setting novaposhta.trackingMaxDays). */
    static final int DEFAULT_MAX_DAYS = 60;
    /**
     * A picked-up parcel whose order still waits is asked about again for this long (money, phone): after «Не забрал на
     * почте» the next look closes the order with what NP collected.
     */
    static final Duration RECHECK_RECEIVED = Duration.ofDays(7);
    /**
     * A picked-up parcel is looked at once a day for this long: a «легке повернення» after pickup shows only as
     * {@code LightReturnNumber} of our received waybill (13.11.2026).
     */
    static final Duration WATCH_RECEIVED = Duration.ofDays(30);
    static final Duration WATCH_INTERVAL = Duration.ofHours(24);

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final NovaPoshtaGateway api;
    private final SettingsService settings;
    private final ShipmentStatusApplier applier;
    private final LinkedParcels linked;
    private final ShipmentNotifier notifier;
    private final NpAlerts alerts;
    private final TransactionTemplate tx;
    private final ShopZone zone;
    private final Clock clock;

    ShipmentTrackingService(OrderShipmentRepository shipments, ShipmentOrders orders, NovaPoshtaGateway api,
                            SettingsService settings, ShipmentStatusApplier applier, LinkedParcels linked,
                            ShipmentNotifier notifier, NpAlerts alerts, TransactionTemplate tx, ShopZone zone,
                            Clock clock) {
        this.shipments = shipments;
        this.orders = orders;
        this.api = api;
        this.settings = settings;
        this.applier = applier;
        this.linked = linked;
        this.notifier = notifier;
        this.alerts = alerts;
        this.tx = tx;
        this.zone = zone;
        this.clock = clock;
    }

    /** Polls every due shipment. Returns how many waybills were asked about. */
    public int pollDue() {
        if (!settings.getBool(DeliverySettings.NP_TRACKING) || !api.keyConfigured()) {
            return 0;
        }
        Instant now = clock.instant();
        List<OrderShipment> due = new ArrayList<>(shipments.findDueForPoll(
                List.of(ShipmentStage.RECEIVED.name(), ShipmentStage.CANCELLED.name()),
                now.minus(MIN_INTERVAL), now.minus(maxAge()), PageRequest.of(0, 1000)));
        due.addAll(recheckReceived(now));
        List<OrderShipment> watched = watchReceived(now, due);
        int failed = 0;
        String lastError = "";
        int batches = 0;
        for (List<OrderShipment> rows : List.of(due, watched)) {
            // The watched ones only show what NP made on their basis (returns, redirects): their own row and the
            // order stay as they are — the money closed with the recheck above.
            boolean apply = rows == due;
            for (int i = 0; i < rows.size(); i += BATCH) {
                batches++;
                String err = poll(rows.subList(i, Math.min(rows.size(), i + BATCH)), apply);
                if (err != null) {
                    failed++;
                    lastError = err;
                }
            }
        }
        if (batches > 0) {
            if (failed > 0) {
                alerts.raise(NpAlerts.Kind.POLL, "Статусы посылок не обновились (" + failed + " из "
                        + batches + " запросов к Новой почте): " + lastError);
            } else {
                alerts.clear(NpAlerts.Kind.POLL);
            }
        }
        remindStorage(now);
        return due.size() + watched.size();
    }

    /**
     * Picked up lately while the order is still SHIPPED: the webhook moved the stage, but the order waits for what
     * only the poll shows — all the money collected («Контроль оплати»), our recipient's phone (a typed-in number).
     */
    List<OrderShipment> recheckReceived(Instant now) {
        List<OrderShipment> rows = shipments.findReceivedSince(ShipmentStage.RECEIVED.name(),
                now.minus(RECHECK_RECEIVED), now.minus(MIN_INTERVAL), PageRequest.of(0, 1000));
        if (rows.isEmpty()) {
            return rows;
        }
        Set<String> waiting = orders.findAll(rows.stream().map(OrderShipment::getOrderId).toList()).stream()
                .filter(o -> o.status() == OrderStatus.SHIPPED)
                .map(o -> UuidUtil.toString(o.id()))
                .collect(Collectors.toSet());
        return rows.stream().filter(s -> waiting.contains(UuidUtil.toString(s.getOrderId()))).toList();
    }

    /** Picked up within {@link #WATCH_RECEIVED}, not looked at for a day, not in {@code due} yet. */
    List<OrderShipment> watchReceived(Instant now, List<OrderShipment> due) {
        Set<String> taken = due.stream().map(s -> UuidUtil.toString(s.getId())).collect(Collectors.toSet());
        return shipments.findReceivedSince(ShipmentStage.RECEIVED.name(), now.minus(WATCH_RECEIVED),
                        now.minus(WATCH_INTERVAL), PageRequest.of(0, 1000)).stream()
                .filter(s -> !taken.contains(UuidUtil.toString(s.getId())))
                .toList();
    }

    /** How long a waybill is polled at all (setting, 60 days by default). */
    Duration maxAge() {
        int days = settings.getInt(DeliverySettings.NP_TRACKING_MAX_DAYS);
        return Duration.ofDays(days > 0 ? days : DEFAULT_MAX_DAYS);
    }

    /** «Обновить» in the order: poll this order's waybill now. */
    public Optional<OrderShipment> refresh(byte[] orderId) {
        Optional<OrderShipment> s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId);
        s.ifPresent(x -> poll(List.of(x), true));
        return s.flatMap(x -> shipments.findById(x.getId()));
    }

    /**
     * {@code apply} = NP's word goes into the row and may move the order; false = only the linked waybills are looked
     * for (the row is stamped as polled).
     *
     * @return null, or NP's error when it did not answer for this batch
     */
    String poll(List<OrderShipment> all, boolean apply) {
        // Dry-run numbers (demo stand) do not exist at NP: stamp them so they stop taking the head of the queue.
        List<OrderShipment> batch = all.stream().filter(s -> !DryRunLabels.isDry(s.getTtn())).toList();
        if (batch.size() < all.size()) {
            stamp(all.stream().filter(s -> DryRunLabels.isDry(s.getTtn())).toList(), null, false);
        }
        if (batch.isEmpty()) {
            return null;
        }
        JsonNode data;
        try {
            data = api.call("TrackingDocument", "getStatusDocuments", request(batch));
        } catch (RuntimeException e) {
            log.warn("NP tracking poll of {} waybills failed: {}", batch.size(), e.getMessage());
            String err = NpJson.cut(e.getMessage(), 500);
            stamp(batch, err, true);
            return err == null ? "" : err;
        }
        Map<String, JsonNode> byTtn = new HashMap<>();
        if (data != null && data.isArray()) {
            for (JsonNode n : data) {
                String number = NpJson.trimmed(n, "Number");
                if (number != null) {
                    byTtn.put(number, n);
                }
            }
        }
        for (OrderShipment s : batch) {
            JsonNode n = byTtn.get(s.getTtn());
            if (n == null) {
                stamp(List.of(s), null, false);
                continue;
            }
            try {
                if (apply) {
                    applier.apply(s.getId(), parse(n), true);
                } else {
                    stamp(List.of(s), null, false);
                }
            } catch (RuntimeException e) {
                log.warn("NP status of waybill {} not applied: {}", s.getTtn(), e.getMessage());
            }
            try {
                linked.discover(s, n);
            } catch (RuntimeException e) {
                log.warn("NP linked waybills of {} not saved: {}", s.getTtn(), e.getMessage());
            }
        }
        return null;
    }

    /** The waybills with the recipient's phone: it opens the full answer for one made outside our cabinet. */
    private ObjectNode request(List<OrderShipment> batch) {
        Map<String, ShippingOrder> byOrder = new HashMap<>();
        orders.findAll(batch.stream().map(OrderShipment::getOrderId).toList())
                .forEach(o -> byOrder.put(UuidUtil.toString(o.id()), o));
        ArrayNode docs = api.array();
        for (OrderShipment s : batch) {
            ObjectNode d = docs.addObject();
            d.put("DocumentNumber", s.getTtn());
            ShippingOrder o = byOrder.get(UuidUtil.toString(s.getOrderId()));
            String phone = o == null ? null : NovaPoshtaSenderService.normalizePhone(o.phone());
            d.put("Phone", phone == null ? "" : phone);
        }
        ObjectNode props = api.props();
        props.set("Documents", docs);
        return props;
    }

    private void stamp(List<OrderShipment> rows, String error, boolean setError) {
        Instant now = clock.instant();
        tx.executeWithoutResult(t -> rows.forEach(s -> shipments.findById(s.getId()).ifPresent(x -> {
            x.setLastPolledAt(now);
            if (setError) {
                x.setPollError(error);
            }
        })));
    }

    /** Reads one getStatusDocuments row. */
    static StatusUpdate parse(JsonNode n) {
        // A redirect's number is not a return (it is followed as a linked waybill, see LinkedParcels).
        String returnTtn = ParcelLink.Kind.ofBasisType(NpJson.trimmed(n, "LastCreatedOnTheBasisDocumentType"))
                == ParcelLink.Kind.REDIRECT ? null : NpJson.trimmed(n, "LastCreatedOnTheBasisNumber");
        LocalDate storage = date(NpJson.text(n, "DateFirstDayStorage"));
        if (storage == null) {
            storage = date(NpJson.text(n, "DatePayedKeeping"));
        }
        return new StatusUpdate(NpJson.text(n, "StatusCode"), statusText(n),
                date(NpJson.text(n, "ScheduledDeliveryDate")), storage, returnTtn, null,
                NpJson.text(n, "PhoneRecipient"), NpMeasure.of(n), NpMeasure.minor(n, "AfterpaymentOnGoodsCost"));
    }

    /** «Відмова від отримання · Одержувач не з'явився до відділення»: why it was not delivered, when NP says. */
    static String statusText(JsonNode n) {
        String status = NpJson.text(n, "Status");
        String why = NpJson.trimmed(n, "UndeliveryReasons");
        if (why == null || status == null || status.contains(why)) {
            return status;
        }
        return status.isBlank() ? why : status.trim() + " · " + why;
    }

    static LocalDate date(String raw) {
        return NpJson.date(raw);
    }

    /** The day before paid storage starts (or later, while it still waits): one reminder. */
    void remindStorage(Instant now) {
        if (!settings.getBool(DeliverySettings.NP_STORAGE_REMINDER)) {
            return;
        }
        LocalDate today = zone.today(clock);
        for (OrderShipment s : shipments.findActiveInStages(List.of(ShipmentStage.ARRIVED.name()))) {
            LocalDate from = s.getStoragePaidFrom();
            if (from == null || s.getStorageNotifiedAt() != null || today.isBefore(from.minusDays(1))) {
                continue;
            }
            Boolean claimed = tx.execute(t -> shipments.findById(s.getId())
                    .filter(x -> x.getStorageNotifiedAt() == null)
                    .map(x -> {
                        x.setStorageNotifiedAt(now);
                        return true;
                    }).orElse(false));
            if (Boolean.TRUE.equals(claimed)) {
                orders.find(s.getOrderId()).ifPresent(o -> notifier.parcelStorage(o, s.getTtn(), from));
            }
        }
    }
}
