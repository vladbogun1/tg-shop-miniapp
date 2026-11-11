package com.maxsolch.shop.order.app;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.lang.Nullable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL;

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
     * @param staleReasons admin only (null for the customer): why the waybill no longer matches the order
     *                     (empty = it does) — such a
     *                     waybill and its label must not be sent; «Перестворити ТТН»
     * @param handedOver   Nova Poshta already accepted the parcel: what is in the box and where it goes no longer
     *                     change here (order edits are refused)
     */
    record ShipmentBrief(
            String ttn,
            @JsonInclude(NON_NULL) @Nullable String origin,
            @JsonInclude(NON_NULL) @Nullable String serviceType,
            String stage,
            @JsonInclude(NON_NULL) @Nullable String statusCode,
            @Nullable String statusText,
            @JsonInclude(NON_NULL) @Nullable LocalDate scheduledDelivery,
            @Nullable Instant arrivedAt,
            @JsonInclude(NON_NULL) @Nullable Instant receivedAt,
            @Nullable LocalDate storagePaidFrom,
            @JsonInclude(NON_NULL) @Nullable String returnTtn,
            long codMinor,
            @JsonInclude(NON_NULL) @Nullable Long deliveryCostMinor,
            @JsonInclude(NON_NULL) @Nullable Integer weightG,
            @JsonInclude(NON_NULL) @Nullable Integer lengthMm,
            @JsonInclude(NON_NULL) @Nullable Integer widthMm,
            @JsonInclude(NON_NULL) @Nullable Integer heightMm,
            @Nullable String trackingUrl,
            @JsonInclude(NON_NULL) @Nullable Instant createdAt,
            @JsonInclude(NON_NULL) @Nullable Instant lastEventAt,
            @JsonInclude(NON_NULL) @Nullable Instant lastPolledAt,
            @JsonInclude(NON_NULL) @Nullable String pollError,
            @JsonInclude(NON_NULL) @Nullable Instant printedAt,
            @JsonInclude(NON_NULL) @Nullable List<String> staleReasons,
            boolean handedOver) {

        /**
         * What the customer sees: the waybill number, the stage and NP's status text, when it arrived, from when
         * storage is paid, what is left to pay at pickup, the tracking link. Every {@code NON_NULL} field is admin-only: dropped
         * (null, so the key is left out of the JSON).
         */
        public ShipmentBrief forCustomer() {
            return new ShipmentBrief(ttn, null, null, stage, null, statusText, null, arrivedAt, null, storagePaidFrom,
                    null, codMinor, null, null, null, null, null, trackingUrl, null, null, null, null, null, null,
                    handedOver);
        }
    }
}
