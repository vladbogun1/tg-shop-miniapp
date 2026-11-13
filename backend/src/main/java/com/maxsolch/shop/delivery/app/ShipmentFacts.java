package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.domain.ShipmentStaleness;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.order.app.OrderShipmentView;
import com.maxsolch.shop.order.app.OrderShipmentView.ShipmentBrief;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.util.UuidUtil;

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
        return brief(s, order, null);
    }

    /**
     * The admin's view of a waybill; {@code hint} = what the packing memory suggests now for its goods (null = the
     * suggestion stored when the waybill was made).
     */
    static ShipmentBrief brief(OrderShipment s, ShippingOrder order, BoxSuggestion.Hint hint) {
        return new ShipmentBrief(s.getTtn(), s.getOrigin(), s.getServiceType(), s.getStage(), s.getStatusCode(),
                s.getStatusText(), s.getScheduledDelivery(), s.getArrivedAt(), s.getReceivedAt(),
                s.getStoragePaidFrom(), s.getReturnTtn(), s.getCodMinor(), s.getDeliveryCostMinor(),
                s.getWeightG(), s.getLengthMm(), s.getWidthMm(), s.getHeightMm(), trackingUrl(s.getTtn()),
                s.getCreatedAt(), s.getLastEventAt(), s.getLastPolledAt(), s.getPollError(), s.getPrintedAt(),
                staleReasons(order, s), ShipmentStatusMapper.handedOver(s.stageEnum()), packing(s, hint));
    }

    /** Active, NP has no parcel yet, and the packer has not confirmed the box. */
    static boolean unconfirmed(OrderShipment s) {
        ShipmentStage stage = s.stageEnum();
        return s.isActive() && s.getBoxConfirmedAt() == null
                && (stage == ShipmentStage.CREATED || stage == ShipmentStage.NOT_FOUND);
    }

    /** An order to pack before its waybill: only the suggestion, nothing confirmed or printed. */
    static OrderShipmentView.Packing toPack(BoxSuggestion.Suggested s, String waiting) {
        return new OrderShipmentView.Packing(s.label(), s.source(), null, null, null, null, null, false, true, null,
                null, null, null, null, null, waiting);
    }

    static OrderShipmentView.Packing packing(OrderShipment s, BoxSuggestion.Hint hint) {
        boolean open = unconfirmed(s);
        String suggested = open && hint != null ? hint.label() : s.getBoxSuggested();
        String source = open && hint != null ? hint.source() : s.getBoxSuggestedSource();
        return new OrderShipmentView.Packing(suggested, source, s.getBoxLabel(),
                s.getBoxId() == null ? null : UuidUtil.toString(s.getBoxId()), s.getBoxHeightMm(),
                s.getBoxConfirmedAt(), s.getBoxConfirmedBy(), s.getPrintedAt() != null, open, s.getStatusCode(),
                s.getNpWeightG(), s.getNpVolumeWeightG(), s.getNpFactualWeightG(), s.getNpCostMinor(),
                s.getNpMeasuredAt(), null);
    }
}
