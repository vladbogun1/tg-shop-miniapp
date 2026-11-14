package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * «Журнал упаковки»: the recent waybills with what was suggested, what the packer confirmed and what Nova Poshta
 * measured when it took the parcel. A read-model over {@code order_shipments} (no table of its own); the goods come
 * from the order module through {@link ShipmentOrders}.
 */
@Service
public class PackingJournal {

    static final int MAX_DAYS = 60;
    static final int MAX_LIMIT = 100;
    /** NP's volumetric divisor: L×W×H cm / 4000 = kg, i.e. mm³ / 4000 = g. */
    static final long VOLUME_DIVISOR = 4000L;
    /** «Перемерили»: NP's charged weight differs from ours by more than this share. */
    static final double REMEASURE_SHARE = 0.15;
    /** NP's price differs from ours by more than a hryvnia: not a rounding of kopiykas. */
    static final long COST_ROUNDING_MINOR = 100;

    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final Clock clock;

    PackingJournal(OrderShipmentRepository shipments, ShipmentOrders orders, Clock clock) {
        this.shipments = shipments;
        this.orders = orders;
        this.clock = clock;
    }

    /**
     * One waybill of the journal (weights in g, sides in mm, money in kopecks).
     *
     * @param goods            «Title (variant) ×2» per line, gifts included
     * @param weightG          what we declared
     * @param deliveryCostMinor NP's price at creation
     * @param npWeightG        NP's charged weight after it took the parcel (DocumentWeight); null until then
     * @param npCostMinor      NP's price after it took the parcel (DocumentCost)
     * @param mismatch         the packer confirmed a different box than the one suggested
     * @param remeasured       NP charged a weight > 15 % off ours (max of real and volumetric) or another price
     * @param seats            two or more seats as sent; null = one (its weight and sides above)
     */
    public record Row(String orderId, String shortId, String ttn, String stage, List<String> goods,
                      String boxSuggested, String boxSuggestedSource, String boxLabel, Instant boxConfirmedAt,
                      String boxConfirmedBy, Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm,
                      Long deliveryCostMinor, Integer npWeightG, Integer npVolumeWeightG, Integer npFactualWeightG,
                      Long npCostMinor, Instant npMeasuredAt, boolean mismatch, boolean remeasured,
                      Instant createdAt, List<Parcel.Seat> seats) {
    }

    public record Journal(int days, List<Row> rows) {
    }

    @Transactional(readOnly = true)
    public Journal recent(Integer days, Integer limit) {
        int d = clamp(days, MAX_DAYS);
        int n = clamp(limit, MAX_LIMIT);
        Instant since = clock.instant().minus(Duration.ofDays(d));
        List<OrderShipment> rows = shipments.findByActiveTrueAndCreatedAtAfterOrderByCreatedAtDesc(since,
                PageRequest.of(0, n));
        Map<String, ShippingOrder> byId = new HashMap<>();
        for (ShippingOrder o : orders.findAll(rows.stream().map(OrderShipment::getOrderId).distinct().toList())) {
            byId.put(UuidUtil.toString(o.id()), o);
        }
        return new Journal(d, rows.stream().map(s -> row(s, byId.get(UuidUtil.toString(s.getOrderId())))).toList());
    }

    private static int clamp(Integer v, int max) {
        return v == null || v <= 0 ? max : Math.min(v, max);
    }

    static Row row(OrderShipment s, ShippingOrder order) {
        String orderId = UuidUtil.toString(s.getOrderId());
        return new Row(orderId, order != null ? order.shortId() : orderId.substring(0, 8), s.getTtn(), s.getStage(),
                order == null ? List.of() : goods(order), s.getBoxSuggested(), s.getBoxSuggestedSource(),
                s.getBoxLabel(), s.getBoxConfirmedAt(), s.getBoxConfirmedBy(), s.getWeightG(), s.getLengthMm(),
                s.getWidthMm(), s.getHeightMm(), s.getDeliveryCostMinor(), s.getNpWeightG(), s.getNpVolumeWeightG(),
                s.getNpFactualWeightG(), s.getNpCostMinor(), s.getNpMeasuredAt(), mismatch(s), remeasured(s),
                s.getCreatedAt(), seatsOrNull(s));
    }

    private static List<String> goods(ShippingOrder order) {
        return order.lines().stream().filter(l -> l.quantity() - l.returnedQty() > 0)
                .map(l -> l.title() + (l.variantName() == null ? "" : " (" + l.variantName() + ")")
                        + " ×" + (l.quantity() - l.returnedQty()) + (l.gift() ? ", подарок" : "")).toList();
    }

    /** The packer confirmed another box than the suggested one. */
    static boolean mismatch(OrderShipment s) {
        return s.getBoxLabel() != null && s.getBoxSuggested() != null
                && !s.getBoxLabel().equals(s.getBoxSuggested());
    }

    /**
     * NP charged differently from what we declared: its weight is > 15 % off ours (the larger of the real and the
     * volumetric weight of our sides), or its price is not the one it quoted at creation.
     */
    static boolean remeasured(OrderShipment s) {
        Integer ours = declaredChargeable(s);
        boolean weight = s.getNpWeightG() != null && ours != null && ours > 0
                && Math.abs(s.getNpWeightG() - ours) > ours * REMEASURE_SHARE;
        boolean cost = s.getNpCostMinor() != null && s.getDeliveryCostMinor() != null
                && Math.abs(s.getNpCostMinor() - s.getDeliveryCostMinor()) > COST_ROUNDING_MINOR;
        return weight || cost;
    }

    private static List<Parcel.Seat> seatsOrNull(OrderShipment s) {
        List<Parcel.Seat> seats = PackingPlaces.stored(s);
        return seats.size() > 1 ? seats : null;
    }

    /**
     * max(declared weight, L×W×H / 4000) in grams; null when nothing was declared. Several seats: NP prices each seat
     * on its own (two seats of 90 ₴ cost 180 ₴), so each counts its own larger weight and they add up.
     */
    static Integer declaredChargeable(OrderShipment s) {
        List<Parcel.Seat> seats = PackingPlaces.stored(s);
        if (seats.size() > 1) {
            return seats.stream().mapToInt(x -> (int) Math.max(x.weightG(),
                    (long) x.lengthMm() * x.widthMm() * x.heightMm() / VOLUME_DIVISOR)).sum();
        }
        Integer w = s.getWeightG();
        if (s.getLengthMm() == null || s.getWidthMm() == null || s.getHeightMm() == null) {
            return w;
        }
        long volume = (long) s.getLengthMm() * s.getWidthMm() * s.getHeightMm() / VOLUME_DIVISOR;
        return (int) Math.max(w == null ? 0 : w, volume);
    }
}
