package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStaleness;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;
import com.maxsolch.shop.order.app.ShippingOrder;

import java.util.List;

/**
 * An order and its waybill side by side: the fingerprints «ТТН устарела» compares ({@link ShipmentStaleness}) and the
 * waybill as the order screens show it ({@link ShipmentBrief}, the branch's {@code ShipmentDto}).
 */
public final class ShipmentFacts {

    public static final String TRACKING_URL = "https://novaposhta.ua/tracking/?cargo_number=";

    private ShipmentFacts() {
    }

    /** What the order has now, for {@link ShipmentStaleness#reasons}. */
    public static ShipmentStaleness.Current current(ShippingOrder o) {
        return new ShipmentStaleness.Current(goodsKey(o), recipientKey(o), o.codMinor());
    }

    /** Product, variant and units still in the order (returned ones are out). */
    public static String goodsKey(ShippingOrder o) {
        return ShipmentStaleness.goodsKey(o.lines().stream()
                .map(l -> new ShipmentStaleness.GoodsLine(l.productId(), l.variantId(),
                        Math.max(0, l.quantity() - Math.max(0, l.returnedQty()))))
                .toList());
    }

    public static String recipientKey(ShippingOrder o) {
        return ShipmentStaleness.recipientKey(o.serviceType() == null ? null : o.serviceType().name(), o.cityRef(),
                o.warehouseRef(), o.streetRef(), o.streetName(), o.building(), o.flat(), o.phone(), o.customerName(),
                o.recipientLastName(), o.recipientFirstName(), o.recipientMiddleName());
    }

    /** Why the waybill no longer matches the order (empty = it does, or the order is unknown). */
    public static List<String> staleReasons(ShippingOrder order, OrderShipment s) {
        return order == null ? List.of() : ShipmentStaleness.reasons(current(order), s);
    }

    public static String trackingUrl(String ttn) {
        return ttn == null || ttn.isBlank() ? null : TRACKING_URL + ttn.replaceAll("\\s+", "");
    }

    /** The admin's view of a waybill; {@code order} null = no staleness check. */
    public static ShipmentBrief brief(OrderShipment s, ShippingOrder order) {
        return new ShipmentBrief(s.getTtn(), s.getOrigin(), s.getServiceType(), s.getStage(), s.getStatusCode(),
                s.getStatusText(), s.getScheduledDelivery(), s.getArrivedAt(), s.getReceivedAt(),
                s.getStoragePaidFrom(), s.getReturnTtn(), s.getCodMinor(), s.getDeliveryCostMinor(),
                s.getWeightG(), s.getLengthMm(), s.getWidthMm(), s.getHeightMm(), trackingUrl(s.getTtn()),
                s.getCreatedAt(), s.getLastEventAt(), s.getLastPolledAt(), s.getPollError(), s.getPrintedAt(),
                staleReasons(order, s), ShipmentStatusMapper.handedOver(s.stageEnum()));
    }
}
