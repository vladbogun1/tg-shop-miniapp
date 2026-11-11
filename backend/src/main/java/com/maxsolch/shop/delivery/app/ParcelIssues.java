package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Parcels that need an admin («Внимание» → «Посылки»): refused or coming back (→ the return wizard of the order), not
 * found, lying in the branch too long, made but not handed over, «ТТН устарела», the money on the waybill differs
 * from the order, a typed-in number of someone else's parcel, a waybill that could not be deleted or updated at NP.
 */
@Service
public class ParcelIssues {

    /** Default for {@code novaposhta.createdStaleDays}. */
    static final Duration CREATED_STALE = Duration.ofDays(2);
    static final String RETURN_HINT = " — проверьте посылку и оформите возврат в заказе («Возврат»)";
    private static final List<String> STAGES = List.of(ShipmentStage.REFUSED.name(), ShipmentStage.RETURNING.name(),
            ShipmentStage.NOT_FOUND.name(), ShipmentStage.ARRIVED.name(), ShipmentStage.CREATED.name(),
            ShipmentStage.IN_TRANSIT.name(), ShipmentStage.RECEIVED.name(), ShipmentStage.CANCELLED.name());

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final SettingsService settings;

    ParcelIssues(OrderShipmentRepository shipments, ShipmentOrders orders, SettingsService settings) {
        this.shipments = shipments;
        this.orders = orders;
        this.settings = settings;
    }

    /** The thresholds from the settings, read once per screen. */
    record ParcelLimits(int arrivedStaleDays, int createdStaleDays, int trackingMaxDays) {
    }

    /** Why a row is shown: {@code kind} goes into the version, {@code urgent} paints it red. */
    record Reason(String kind, String text, boolean urgent) {
    }

    /**
     * One parcel to look at.
     *
     * @param codMinor what the waybill collects on pickup, null = nothing
     */
    public record ParcelIssue(String shipmentId, String orderId, String shortId, String orderStatus, String customerName,
                        String ttn, String stage, String kind, String text, boolean urgent, Instant since,
                        Long codMinor) {
    }

    public List<ParcelIssue> current(Instant now) {
        ParcelLimits limits = new ParcelLimits(Math.max(1, settings.getInt(DeliverySettings.NP_ARRIVED_STALE_DAYS)),
                Math.max(1, settings.getInt(DeliverySettings.NP_CREATED_STALE_DAYS)),
                Math.max(1, settings.getInt(DeliverySettings.NP_TRACKING_MAX_DAYS)));
        // RECEIVED / CANCELLED rows are many and mostly fine: only recent ones can still need someone.
        Instant recent = now.minus(Duration.ofDays(limits.trackingMaxDays()));
        List<OrderShipment> rows = shipments.findActiveInStages(STAGES).stream()
                .filter(s -> !s.stageEnum().terminal() || s.getCreatedAt() == null || s.getCreatedAt().isAfter(recent))
                .toList();
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, ShippingOrder> byId = new HashMap<>();
        orders.findAll(rows.stream().map(OrderShipment::getOrderId).toList())
                .forEach(o -> byId.put(UuidUtil.toString(o.id()), o));
        List<ParcelIssue> out = new ArrayList<>();
        for (OrderShipment s : rows) {
            ShippingOrder o = byId.get(UuidUtil.toString(s.getOrderId()));
            Reason r = o == null ? null : reason(s, o, now, limits);
            if (r != null) {
                out.add(issue(s, o, r));
            }
        }
        return out;
    }

    /** Why this waybill is on the screen, or null when it is fine. */
    static Reason reason(OrderShipment s, ShippingOrder o, Instant now, ParcelLimits limits) {
        ShipmentStage stage = s.stageEnum();
        boolean rejected = o.status() == OrderStatus.REJECTED;
        if (stage == null) {
            return null;
        }
        Reason closed = closedOrder(s, o, stage, rejected);
        if (closed != null || stage.terminal()) {
            return closed;
        }
        if (OrderShipment.ORIGIN_MANUAL.equals(s.getOrigin()) && s.getPollError() != null
                && s.getPollError().startsWith(ShipmentStatusApplier.FOREIGN_PARCEL)) {
            return new Reason("FOREIGN", s.getPollError(), true);
        }
        if (!rejected) {
            Reason drift = drift(s, o, stage);
            if (drift != null) {
                return drift;
            }
        }
        if (s.getCreatedAt() != null && Duration.between(s.getCreatedAt(), now).toDays() >= limits.trackingMaxDays()) {
            return new Reason("TRACKING_STOPPED", "Статус больше не отслеживается (ТТН старше "
                    + limits.trackingMaxDays() + " дн.) — проверьте посылку в кабинете Новой почты", false);
        }
        String text = reason(s, now, limits.arrivedStaleDays(), Duration.ofDays(limits.createdStaleDays()));
        return text == null ? null : new Reason(stage.name(), text,
                stage == ShipmentStage.REFUSED || stage == ShipmentStage.NOT_FOUND);
    }

    /** Rejected order with a parcel at NP or a waybill left there; a deleted waybill; picked up but still SHIPPED. */
    private static Reason closedOrder(OrderShipment s, ShippingOrder o, ShipmentStage stage, boolean rejected) {
        if (rejected && (stage == ShipmentStage.IN_TRANSIT || stage == ShipmentStage.ARRIVED)) {
            return new Reason("REJECTED_AT_NP", "Заказ отклонён, а посылка у Новой почты" + RETURN_HINT, true);
        }
        if (rejected && (stage == ShipmentStage.CREATED || stage == ShipmentStage.NOT_FOUND)
                && OrderShipment.ORIGIN_API.equals(s.getOrigin())) {
            return new Reason("REJECTED_TTN", s.getSyncError() != null ? s.getSyncError()
                    : "Заказ отклонён, а ТТН не удалилась в Новой почте — удалите её в кабинете НП", true);
        }
        if (stage == ShipmentStage.CANCELLED) {
            return rejected ? null : new Reason("CANCELLED", "ТТН удалена в Новой почте, а заказ не отклонён", true);
        }
        if (stage == ShipmentStage.RECEIVED) {
            return o.status() == OrderStatus.SHIPPED
                    ? new Reason("RECEIVED_SHIPPED", "Посылку забрали, а заказ всё ещё «Отправлен»", false) : null;
        }
        return null;
    }

    /** The order changed after the waybill and NP was not (or could not be) updated. */
    private static Reason drift(OrderShipment s, ShippingOrder o, ShipmentStage stage) {
        List<String> stale = ShipmentFacts.staleReasons(o, s);
        if (!stale.isEmpty()) {
            return new Reason("STALE", "ТТН устарела: " + String.join("; ", stale)
                    + " — «Перестворити ТТН», старую этикетку не отправлять", true);
        }
        boolean open = stage == ShipmentStage.CREATED || stage == ShipmentStage.IN_TRANSIT
                || stage == ShipmentStage.ARRIVED;
        if (OrderShipment.ORIGIN_API.equals(s.getOrigin()) && open) {
            long onWaybill = s.collects() ? s.getCodMinor() : 0;
            long owed = o.codMinor();
            if (onWaybill != owed) {
                return new Reason("COD_DRIFT", "Наложка в ТТН " + MoneyFormat.uah(onWaybill) + ", а по заказу "
                        + MoneyFormat.uah(owed) + (stage == ShipmentStage.CREATED
                        ? " — обновите ТТН" : " — посылка уже у Новой почты, сумму меняют в её кабинете"), true);
            }
        }
        if (s.getSyncError() != null && !s.getSyncError().isBlank()) {
            return new Reason("SYNC_ERROR", s.getSyncError(), true);
        }
        return null;
    }

    /** The stage alone (refused, returning, not found, waiting too long, not handed over). */
    static String reason(OrderShipment s, Instant now, int staleDays) {
        return reason(s, now, staleDays, CREATED_STALE);
    }

    static String reason(OrderShipment s, Instant now, int staleDays, Duration createdStale) {
        ShipmentStage stage = s.stageEnum();
        if (stage == null) {
            return null;
        }
        return switch (stage) {
            case REFUSED -> "Отказ от посылки" + RETURN_HINT;
            case RETURNING -> "Посылка возвращается"
                    + (s.getReturnTtn() != null ? " · ТТН возврата " + s.getReturnTtn() : "") + RETURN_HINT;
            case NOT_FOUND -> "ТТН не найдена в Новой почте";
            case ARRIVED -> {
                Instant at = s.getArrivedAt();
                yield at != null && Duration.between(at, now).toDays() >= staleDays
                        ? "Лежит в отделении " + Duration.between(at, now).toDays() + " дн."
                        + (s.getStoragePaidFrom() != null ? " · платное хранение с " + s.getStoragePaidFrom() : "")
                        : null;
            }
            case CREATED -> s.getCreatedAt() != null
                    && Duration.between(s.getCreatedAt(), now).compareTo(createdStale) >= 0
                    ? "ТТН создана, но посылку не сдали" : null;
            default -> null;
        };
    }

    private static ParcelIssue issue(OrderShipment s, ShippingOrder o, Reason r) {
        Instant since = s.stageEnum() == ShipmentStage.ARRIVED && s.getArrivedAt() != null ? s.getArrivedAt()
                : s.getLastEventAt() != null ? s.getLastEventAt() : s.getCreatedAt();
        Long cod = s.collects() && s.getCodMinor() > 0 ? s.getCodMinor() : null;
        return new ParcelIssue(UuidUtil.toString(s.getId()), UuidUtil.toString(o.id()), o.shortId(), o.status().name(),
                o.customerName(), s.getTtn(), s.getStage(), r.kind(), r.text(), r.urgent(), since, cod);
    }
}
