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
     * @param packing      admin only: the suggested and the confirmed box, NP's re-measure (null for the customer)
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
            boolean handedOver,
            @JsonInclude(NON_NULL) @Nullable Packing packing) {

        /** Without the packing block (the shape before V99). */
        public ShipmentBrief(String ttn, String origin, String serviceType, String stage, String statusCode,
                             String statusText, LocalDate scheduledDelivery, Instant arrivedAt, Instant receivedAt,
                             LocalDate storagePaidFrom, String returnTtn, long codMinor, Long deliveryCostMinor,
                             Integer weightG, Integer lengthMm, Integer widthMm, Integer heightMm, String trackingUrl,
                             Instant createdAt, Instant lastEventAt, Instant lastPolledAt, String pollError,
                             Instant printedAt, List<String> staleReasons, boolean handedOver) {
            this(ttn, origin, serviceType, stage, statusCode, statusText, scheduledDelivery, arrivedAt, receivedAt,
                    storagePaidFrom, returnTtn, codMinor, deliveryCostMinor, weightG, lengthMm, widthMm, heightMm,
                    trackingUrl, createdAt, lastEventAt, lastPolledAt, pollError, printedAt, staleReasons, handedOver,
                    null);
        }

        /**
         * What the customer sees: the waybill number, the stage and NP's status text, when it arrived, from when
         * storage is paid, what is left to pay at pickup, the tracking link. Every {@code NON_NULL} field is admin-only: dropped
         * (null, so the key is left out of the JSON).
         */
        public ShipmentBrief forCustomer() {
            return new ShipmentBrief(ttn, null, null, stage, null, statusText, null, arrivedAt, null, storagePaidFrom,
                    null, codMinor, null, null, null, null, null, trackingUrl, null, null, null, null, null, null,
                    handedOver, null);
        }
    }

    /**
     * The box of a parcel (V99), admin only.
     *
     * @param boxSuggested       what the system suggested («Коробка 5 кг · 13 см»)
     * @param boxSuggestedSource «по прошлым заказам ×3» | «подобрано по размерам»
     * @param boxLabel           the box the packer confirmed; null = not confirmed
     * @param boxId              the confirmed catalog box (null = typed-in sides)
     * @param boxHeightMm        the height it was confirmed at (a fold line)
     * @param printed            the label was printed through us: changing the box makes a NEW waybill number
     * @param unconfirmed        active, not yet handed over to NP and no box confirmed: the packer still has to tap
     * @param npWeightG          NP's weight after acceptance (DocumentWeight), g
     * @param npVolumeWeightG    NP's volumetric weight (VolumeWeight), g
     * @param npFactualWeightG   NP's scales (FactualWeight), g
     * @param npCostMinor        NP's delivery price after acceptance (DocumentCost), kopecks
     */
    record Packing(
            @Nullable String boxSuggested,
            @Nullable String boxSuggestedSource,
            @Nullable String boxLabel,
            @Nullable String boxId,
            @Nullable Integer boxHeightMm,
            @Nullable Instant boxConfirmedAt,
            @Nullable String boxConfirmedBy,
            boolean printed,
            boolean unconfirmed,
            @Nullable String statusCode,
            @Nullable Integer npWeightG,
            @Nullable Integer npVolumeWeightG,
            @Nullable Integer npFactualWeightG,
            @Nullable Long npCostMinor,
            @Nullable Instant npMeasuredAt) {
    }
}
