package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Labels;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * One PDF with the labels of these orders' waybills: 100x100 (thermal label, default), 85x85 (A4 sheet of four),
 * a4 (the full waybill). Only waybills made with our key print through it; a stale one is left out (that label must
 * not go with the parcel). Printing is remembered: NP then no longer updates the waybill, a change makes a new one.
 */
@Service
public class ShipmentLabels {

    static final int MAX_LABELS = 100;
    private static final Pattern REAL_TTN = Pattern.compile("^[0-9]{14}$");

    private final NovaPoshtaGateway api;
    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final ShipmentStore store;

    ShipmentLabels(NovaPoshtaGateway api, OrderShipmentRepository shipments, ShipmentOrders orders,
                   ShipmentStore store) {
        this.api = api;
        this.shipments = shipments;
        this.orders = orders;
        this.store = store;
    }

    public Labels labels(List<String> orderIds, String format) {
        List<byte[]> ids = orderIds.stream().map(UuidUtil::toBytes).toList();
        List<OrderShipment> active = shipments.findByOrderIdInAndActiveTrue(ids);
        List<String> ttns = active.stream().filter(s -> OrderShipment.ORIGIN_API.equals(s.getOrigin()))
                .map(OrderShipment::getTtn).filter(t -> DryRunLabels.isDry(t) || REAL_TTN.matcher(t).matches())
                .distinct().toList();
        Map<String, ShippingOrder> byId = new HashMap<>();
        orders.findAll(ids).forEach(o -> byId.put(UuidUtil.toString(o.id()), o));
        List<String> stale = active.stream()
                .filter(s -> ttns.contains(s.getTtn()))
                .filter(s -> !ShipmentFacts.staleReasons(byId.get(UuidUtil.toString(s.getOrderId())), s).isEmpty())
                .map(OrderShipment::getTtn).toList();
        List<String> printable = ttns.stream().filter(t -> !stale.contains(t)).toList();
        List<String> skipped = active.stream().map(OrderShipment::getTtn).filter(t -> !printable.contains(t))
                .distinct().toList();
        if (printable.isEmpty() && !stale.isEmpty()) {
            throw new DomainException.BadRequest(DeliveryError.NP_TTN_STALE, String.join(", ", stale)
                    + " — заказ изменился после неё");
        }
        if (ttns.isEmpty()) {
            throw NpErrors.bad(skipped.isEmpty() ? "У выбранных заказов нет ТТН — сначала создайте их"
                    : "ТТН выбранных заказов введены вручную — печатайте их в кабинете Новой почты");
        }
        Labels out = labelsOf(printable, format, skipped);
        store.markPrinted(active.stream().filter(s -> printable.contains(s.getTtn())).map(OrderShipment::getId)
                .toList());
        return out;
    }

    private Labels labelsOf(List<String> ttns, String format, List<String> skipped) {
        if (ttns.size() > MAX_LABELS) {
            throw NpErrors.bad("За раз можно напечатать до " + MAX_LABELS + " этикеток");
        }
        List<String> real = ttns.stream().filter(t -> !DryRunLabels.isDry(t)).toList();
        if (real.isEmpty() || api.dryRun()) {
            return new Labels(DryRunLabels.pdf(ttns), ttns.size(), true, skipped);
        }
        String kind = switch (format == null ? "" : format) {
            case "85x85" -> "printMarking85x85";
            case "a4" -> "printDocument";
            default -> "printMarking100x100";
        };
        return new Labels(api.printPdf(kind, real), real.size(), false, skipped);
    }
}
