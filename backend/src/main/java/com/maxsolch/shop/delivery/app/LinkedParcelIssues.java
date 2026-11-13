package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ParcelIssues.ParcelIssue;
import com.maxsolch.shop.delivery.app.ParcelIssues.Reason;
import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.ParcelLinkRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * «Внимание → Посылки» rows of the linked waybills (V103): a return waits for us in the branch, a return was picked up
 * but not accepted in the order, the customer sent a return after pickup, a redirected parcel was picked up or is
 * coming back. Gone once the order says so (return accepted, order closed).
 */
@Service
public class LinkedParcelIssues {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM");
    private static final String ACCEPTED = "RECEIVED";
    private static final String IN_TRANSIT = "IN_TRANSIT";

    private final ParcelLinkRepository links;
    private final ShipmentOrders orders;

    LinkedParcelIssues(ParcelLinkRepository links, ShipmentOrders orders) {
        this.links = links;
        this.orders = orders;
    }

    public List<ParcelIssue> current(Instant now) {
        List<ParcelLink> rows = links.findByCreatedAtAfter(now.minus(LinkedParcelPolling.FOLLOW));
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, ShippingOrder> byId = new HashMap<>();
        orders.findAll(rows.stream().map(ParcelLink::getOrderId).toList())
                .forEach(o -> byId.put(UuidUtil.toString(o.id()), o));
        List<ParcelIssue> out = new ArrayList<>();
        for (ParcelLink l : rows) {
            ShippingOrder o = byId.get(UuidUtil.toString(l.getOrderId()));
            Reason r = o == null || o.archived() ? null : reason(l, o);
            if (r != null) {
                out.add(new ParcelIssue(UuidUtil.toString(l.getId()), UuidUtil.toString(o.id()), o.shortId(),
                        o.status().name(), o.customerName(), l.getTtn(), l.getStage(), r.kind(), r.text(), r.urgent(),
                        since(l), null));
            }
        }
        return out;
    }

    /** Why this linked waybill is on the screen, or null. */
    static Reason reason(ParcelLink l, ShippingOrder o) {
        ShipmentStage stage = l.stageEnum();
        return l.kindEnum().toUs() ? toUs(l, o, stage) : redirect(o, stage);
    }

    private static Reason toUs(ParcelLink l, ShippingOrder o, ShipmentStage stage) {
        if (ACCEPTED.equals(o.returnStatus()) || settledLightReturn(l, o)) {
            return null;
        }
        if (stage == ShipmentStage.ARRIVED) {
            return new Reason("RETURN_WAITING", "Возврат ждёт нас в отделении"
                    + (l.getStoragePaidFrom() == null ? "" : " · платное хранение с " + l.getStoragePaidFrom().format(DAY))
                    + " — заберите и " + acceptHint(l.kindEnum(), o), true);
        }
        if (stage == ShipmentStage.RECEIVED) {
            return new Reason("RETURN_PICKED", "Возврат забрали — " + acceptHint(l.kindEnum(), o), false);
        }
        if (l.kindEnum() == ParcelLink.Kind.LIGHT_RETURN && stage != ShipmentStage.CANCELLED
                && o.status() == OrderStatus.DELIVERED && o.returnStatus() == null) {
            return new Reason("LIGHT_RETURN", "Покупатель отправил возврат после получения — оформите «Возврат», "
                    + "когда посылка придёт", false);
        }
        return null;
    }

    /**
     * The button that takes the goods back: a return after pickup is «Возврат» of a delivered order; a parcel coming
     * back is «Посылка вернулась», which shows only after «Едет назад».
     */
    static String acceptHint(ParcelLink.Kind kind, ShippingOrder o) {
        if (IN_TRANSIT.equals(o.returnStatus())) {
            return "отметьте в заказе «Посылка вернулась»";
        }
        if (kind == ParcelLink.Kind.LIGHT_RETURN || o.status() == OrderStatus.DELIVERED) {
            return "оформите в заказе «Возврат»";
        }
        return "отметьте в заказе «Едет назад», затем «Посылка вернулась»";
    }

    /**
     * A return after pickup the owner already took in with «Возврат» straight to stock (no «едет назад» step): the
     * order has returned units and no parcel on its way.
     */
    private static boolean settledLightReturn(ParcelLink l, ShippingOrder o) {
        return l.kindEnum() == ParcelLink.Kind.LIGHT_RETURN && o.returnStatus() == null
                && o.lines().stream().anyMatch(x -> x.returnedQty() > 0);
    }

    /** The goods travel on the redirect: picked up → close the order; refused → «Едет назад» like the parcel itself. */
    private static Reason redirect(ShippingOrder o, ShipmentStage stage) {
        if (o.status() != OrderStatus.SHIPPED) {
            return null;
        }
        if (stage == ShipmentStage.RECEIVED) {
            return new Reason("REDIRECT_RECEIVED", "Переадресованную посылку забрали — закройте заказ («Доставлен»)",
                    false);
        }
        if (stage == ShipmentStage.REFUSED || stage == ShipmentStage.RETURNING) {
            return new Reason(stage.name(), "Переадресованную посылку не забрали — нажмите «Едет назад»: заказ "
                    + "отклонится, посылка в пути к нам", true);
        }
        return null;
    }

    private static Instant since(ParcelLink l) {
        if (l.getReceivedAt() != null) {
            return l.getReceivedAt();
        }
        return l.getArrivedAt() != null ? l.getArrivedAt() : l.getCreatedAt();
    }
}
