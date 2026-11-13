package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A waybill (ТТН) of an order and the last status Nova Poshta reported for it (V65). One active row
 * per order: a cancelled waybill stays for the history with {@code active = false}.
 * {@code orders.tracking_number} keeps mirroring {@link #ttn} for everything that read it before.
 */
@Getter
@Setter
@Entity
@Table(name = "order_shipments")
public class OrderShipment {

    public static final String ORIGIN_API = "API";
    public static final String ORIGIN_MANUAL = "MANUAL";

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "carrier", nullable = false, length = 16)
    private String carrier = "NOVA_POSHTA";

    /** {@link #ORIGIN_API} — created with our key (has {@link #npRef}); {@link #ORIGIN_MANUAL} — typed in. */
    @Column(name = "origin", nullable = false, length = 16)
    private String origin;

    @Column(name = "ttn", nullable = false, length = 32)
    private String ttn;

    /** InternetDocument Ref — needed to update/delete a waybill we created. */
    @Column(name = "np_ref", length = 64)
    private String npRef;

    @Column(name = "service_type", length = 16)
    private String serviceType;

    /** {@link ShipmentStage} name. */
    @Column(name = "stage", nullable = false, length = 16)
    private String stage;

    @Column(name = "status_code", length = 8)
    private String statusCode;

    @Column(name = "status_text", length = 255)
    private String statusText;

    @Column(name = "weight_g")
    private Integer weightG;

    @Column(name = "length_mm")
    private Integer lengthMm;

    @Column(name = "width_mm")
    private Integer widthMm;

    @Column(name = "height_mm")
    private Integer heightMm;

    /** Declared value (оголошена вартість). */
    @Column(name = "declared_minor")
    private Long declaredMinor;

    /** Collected from the recipient via «Контроль оплати» (0 = nothing). */
    @Column(name = "cod_minor", nullable = false)
    private long codMinor = 0;

    @Column(name = "payer_type", length = 16)
    private String payerType;

    /** Delivery price NP quoted when creating (CostOnSite). */
    @Column(name = "delivery_cost_minor")
    private Long deliveryCostMinor;

    @Column(name = "scheduled_delivery")
    private LocalDate scheduledDelivery;

    @Column(name = "arrived_at")
    private Instant arrivedAt;

    @Column(name = "received_at")
    private Instant receivedAt;

    /** First day of paid storage (DatePayedKeeping / DateFirstDayStorage). */
    @Column(name = "storage_paid_from")
    private LocalDate storagePaidFrom;

    /** Waybill NP created on the basis of this one (return / redirect). */
    @Column(name = "return_ttn", length = 32)
    private String returnTtn;

    @Column(name = "arrival_notified_at")
    private Instant arrivalNotifiedAt;

    @Column(name = "storage_notified_at")
    private Instant storageNotifiedAt;

    @Column(name = "last_polled_at")
    private Instant lastPolledAt;

    /** When the stage last changed (poll or webhook). */
    @Column(name = "last_event_at")
    private Instant lastEventAt;

    @Column(name = "poll_error", length = 500)
    private String pollError;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    /** Our branch the parcel goes from (V66) — an automatic «update» sends the same one. */
    @Column(name = "sender_warehouse_ref", length = 64)
    private String senderWarehouseRef;

    /** Collect the rest through «Контроль оплати» (V66); null on older rows = {@code codMinor > 0}. */
    @Column(name = "collect_cod")
    private Boolean collectCod;

    /** {@code Parcel} | {@code Documents} (V66); null = Parcel. */
    @Column(name = "cargo_type", length = 16)
    private String cargoType;

    /** Our own price estimate when the waybill was made, compared with {@link #deliveryCostMinor}. */
    @Column(name = "estimate_minor")
    private Long estimateMinor;

    /** When the label was printed through us (V67): NP no longer updates the waybill — only delete + new. */
    @Column(name = "printed_at")
    private Instant printedAt;

    /** {@link ShipmentStaleness#goodsKey} of the order when the waybill was made or last updated (V67). */
    @Column(name = "goods_key", length = 64)
    private String goodsKey;

    /** {@link ShipmentStaleness#recipientKey} of the order then (V67). */
    @Column(name = "recipient_key", length = 64)
    private String recipientKey;

    /** Why the automatic update after an order change failed (V67); the poll never clears it. */
    @Column(name = "sync_error", length = 500)
    private String syncError;

    /** Backfilled by V65: its first status is applied without messages and without moving the order. */
    @Column(name = "quiet", nullable = false)
    private boolean quiet;

    /** The box the system suggested when the waybill was made (V99), e.g. «Коробка 5 кг · 13 см». */
    @Column(name = "box_suggested", length = 120)
    private String boxSuggested;

    /** Where the suggestion came from: «по прошлым заказам ×3» / «подобрано по размерам». */
    @Column(name = "box_suggested_source", length = 60)
    private String boxSuggestedSource;

    /** The box the packer confirmed (V99); null = not confirmed yet. */
    @Column(name = "box_label", length = 120)
    private String boxLabel;

    @Column(name = "box_id", columnDefinition = "BINARY(16)")
    private byte[] boxId;

    @Column(name = "box_height_mm")
    private Integer boxHeightMm;

    @Column(name = "box_confirmed_at")
    private Instant boxConfirmedAt;

    @Column(name = "box_confirmed_by", length = 255)
    private String boxConfirmedBy;

    /** Nova Poshta's own measure once it accepted the parcel (V99); our declared columns stay as sent. */
    @Column(name = "np_weight_g")
    private Integer npWeightG;

    @Column(name = "np_volume_weight_g")
    private Integer npVolumeWeightG;

    @Column(name = "np_factual_weight_g")
    private Integer npFactualWeightG;

    @Column(name = "np_cost_minor")
    private Long npCostMinor;

    @Column(name = "np_measured_at")
    private Instant npMeasuredAt;

    /** What NP collected through «Контроль оплати» at pickup (V102); null = not known yet. */
    @Column(name = "np_collected_minor")
    private Long npCollectedMinor;

    /** Poll and webhook may apply a status at once: the second one retries on fresh data. */
    @jakarta.persistence.Version
    @Column(name = "version", nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    public ShipmentStage stageEnum() {
        return ShipmentStage.of(stage);
    }

    /** The packer's box: what it is called, the catalog box (null = typed-in sides), at what height. */
    public void confirmBox(String label, byte[] box, Integer heightMm, Instant at, String by) {
        boxLabel = label;
        boxId = box;
        boxHeightMm = heightMm;
        boxConfirmedAt = at;
        boxConfirmedBy = by;
    }

    /** The goods changed: a box confirmed for the old ones says nothing about the new. */
    public void dropBoxConfirmation() {
        confirmBox(null, null, null, null, null);
    }

    /**
     * Nova Poshta's measure after acceptance: each value it reported replaces the last one, an absent one keeps it;
     * {@code np_measured_at} is the first time.
     */
    public void recordNpMeasure(NpMeasure m, Instant at) {
        if (m == null || m.empty()) {
            return;
        }
        npWeightG = m.weightG() != null ? m.weightG() : npWeightG;
        npVolumeWeightG = m.volumeWeightG() != null ? m.volumeWeightG() : npVolumeWeightG;
        npFactualWeightG = m.factualWeightG() != null ? m.factualWeightG() : npFactualWeightG;
        npCostMinor = m.costMinor() != null ? m.costMinor() : npCostMinor;
        if (npMeasuredAt == null) {
            npMeasuredAt = at;
        }
    }

    /** Whether this waybill collects money: the stored flag, or (older rows) a non-zero COD. */
    public boolean collects() {
        return collectCod != null ? collectCod : codMinor > 0;
    }

    /**
     * What the pickup must have collected: the waybill's COD, or less when the order owes less now — after «Не забрал
     * на почте» the order's наложка drops to what was bought, the waybill keeps the old sum. 0 = nothing.
     */
    public long collectDueMinor(long orderOwesMinor) {
        return collects() ? Math.max(0, Math.min(codMinor, orderOwesMinor)) : 0;
    }

    /**
     * Whether a pickup NP reported with {@code reportedMinor} collected may close the order by itself: nothing is due,
     * or NP collected all of it. Unknown (a webhook, an absent or zero field) or less — a partial pickup (#1c60c7c7,
     * 13.11.2026) — waits for the admin: a wrong hold costs one tap, a wrong close costs money.
     */
    public boolean pickupSettles(Long reportedMinor, long orderOwesMinor) {
        long due = collectDueMinor(orderOwesMinor);
        return due == 0 || (reportedMinor != null && reportedMinor >= due);
    }

    /** NP reported less collected at pickup than is due («частичный выкуп» not yet booked in the order). */
    public boolean partlyCollected(long orderOwesMinor) {
        long due = collectDueMinor(orderOwesMinor);
        return due > 0 && npCollectedMinor != null && npCollectedMinor < due;
    }
}
