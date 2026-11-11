package com.maxsolch.shop.order.app;

import org.springframework.lang.Nullable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The Nova Poshta parcel (waybill) of orders, as the order screens show it and as the order rules need it (no edits
 * once Nova Poshta has the parcel). Declared by the order module and implemented by {@code delivery}, so the
 * dependency points one way (delivery → order), like {@link OrderReturnsView}.
 */
public interface OrderShipmentView {

    /**
     * The active parcel of each order that has one (the newest when, by accident, there are two).
     *
     * @return order id ({@code UuidUtil.toString}) → its parcel; orders without a waybill are absent
     */
    Map<String, ShipmentBrief> forOrders(Collection<byte[]> orderIds);

    /** The active parcel of one order. */
    default Optional<ShipmentBrief> forOrder(byte[] orderId) {
        return forOrders(List.of(orderId)).values().stream().findFirst();
    }

    /**
     * One parcel; the JSON is the branch's {@code ShipmentDto} plus {@code handedOver}.
     *
     * @param stage        CREATED | IN_TRANSIT | ARRIVED | RECEIVED | REFUSED | RETURNING | CANCELLED | NOT_FOUND
     * @param origin       API (made with the shop's key — can be edited, deleted, printed) | MANUAL (typed in)
     * @param trackingUrl  public tracking page of novaposhta.ua
     * @param printedAt    admin only: when its label was printed through us (NP then only deletes it)
     * @param staleReasons admin only: why the waybill no longer matches the order (empty = it does) — such a
     *                     waybill and its label must not be sent; «Перестворити ТТН»
     * @param handedOver   Nova Poshta already accepted the parcel: what is in the box and where it goes no longer
     *                     change here (order edits are refused)
     */
    record ShipmentBrief(
            String ttn,
            String origin,
            @Nullable String serviceType,
            String stage,
            @Nullable String statusCode,
            @Nullable String statusText,
            @Nullable LocalDate scheduledDelivery,
            @Nullable Instant arrivedAt,
            @Nullable Instant receivedAt,
            @Nullable LocalDate storagePaidFrom,
            @Nullable String returnTtn,
            long codMinor,
            @Nullable Long deliveryCostMinor,
            @Nullable Integer weightG,
            @Nullable Integer lengthMm,
            @Nullable Integer widthMm,
            @Nullable Integer heightMm,
            @Nullable String trackingUrl,
            @Nullable Instant createdAt,
            @Nullable Instant lastEventAt,
            @Nullable Instant lastPolledAt,
            @Nullable String pollError,
            @Nullable Instant printedAt,
            List<String> staleReasons,
            boolean handedOver) {

        /** What the customer sees: the poll diagnostics, the print time and the staleness stay admin-only. */
        public ShipmentBrief forCustomer() {
            return new ShipmentBrief(ttn, origin, serviceType, stage, statusCode, statusText, scheduledDelivery,
                    arrivedAt, receivedAt, storagePaidFrom, returnTtn, codMinor, deliveryCostMinor, weightG, lengthMm,
                    widthMm, heightMm, trackingUrl, createdAt, lastEventAt, null, null, null, List.of(), handedOver);
        }
    }
}
