package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;

/**
 * A waybill Nova Poshta made on the basis of ours (V103): the return to us (CargoReturn), a redirect, a «легке
 * повернення» after pickup. Shown next to the order's parcel and tracked by itself; it NEVER moves the order — «отримано»
 * of a return means the shop picked it up, not that the customer got the order.
 */
@Getter
@Setter
@Entity
@Table(name = "order_parcel_links")
public class ParcelLink {

    /** What the linked waybill is. */
    public enum Kind {
        /** Back to us: refused, not picked up, or a return ordered at NP (NP's {@code CargoReturn}). */
        RETURN,
        /** The customer sent it on to another branch/address ({@code Redirecting}): the goods travel on this one. */
        REDIRECT,
        /** A return after pickup ({@code LightReturnNumber} of a received parcel). */
        LIGHT_RETURN;

        /** NP's {@code LastCreatedOnTheBasisDocumentType}; null for the types we do not follow (redelivery, disposal). */
        public static Kind ofBasisType(String npType) {
            if (npType == null) {
                return null;
            }
            return switch (npType.trim().toLowerCase(Locale.ROOT)) {
                case "cargoreturn", "return" -> RETURN;
                case "redirecting" -> REDIRECT;
                default -> null;
            };
        }

        /** Comes back to the shop (the shop picks it up). */
        public boolean toUs() {
            return this != REDIRECT;
        }
    }

    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    @jakarta.persistence.Id
    private byte[] id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "shipment_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] shipmentId;

    @Column(name = "kind", nullable = false, length = 16)
    private String kind;

    @Column(name = "ttn", nullable = false, length = 32)
    private String ttn;

    /** {@link ShipmentStage} name. */
    @Column(name = "stage", nullable = false, length = 16)
    private String stage = ShipmentStage.CREATED.name();

    @Column(name = "status_code", length = 8)
    private String statusCode;

    @Column(name = "status_text", length = 255)
    private String statusText;

    @Column(name = "storage_paid_from")
    private LocalDate storagePaidFrom;

    @Column(name = "arrived_at")
    private Instant arrivedAt;

    @Column(name = "received_at")
    private Instant receivedAt;

    @Column(name = "last_polled_at")
    private Instant lastPolledAt;

    @Column(name = "poll_error", length = 500)
    private String pollError;

    /** The last stage the sellers were told about (ARRIVED / RECEIVED): one message per stage. */
    @Column(name = "notified_stage", length = 16)
    private String notifiedStage;

    @jakarta.persistence.Version
    @Column(name = "version", nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    protected ParcelLink() {
    }

    public ParcelLink(byte[] orderId, byte[] shipmentId, Kind kind, String ttn) {
        this.orderId = orderId;
        this.shipmentId = shipmentId;
        this.kind = kind.name();
        this.ttn = ttn;
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    public Kind kindEnum() {
        return Kind.valueOf(kind);
    }

    public ShipmentStage stageEnum() {
        return ShipmentStage.of(stage);
    }

    /**
     * NP's latest word on it. A stage it reaches for the first time stamps {@code arrivedAt} / {@code receivedAt}.
     *
     * @return the new stage when it changed, else null
     */
    public ShipmentStage report(ShipmentStage next, String code, String text, LocalDate storageFrom, Instant now) {
        statusCode = code == null || code.length() <= 8 ? code : code.substring(0, 8);
        if (text != null) {
            statusText = text.length() > 255 ? text.substring(0, 255) : text;
        }
        if (storageFrom != null) {
            storagePaidFrom = storageFrom;
        }
        lastPolledAt = now;
        pollError = null;
        if (next == null || next.name().equals(stage)) {
            return null;
        }
        stage = next.name();
        if (next == ShipmentStage.ARRIVED && arrivedAt == null) {
            arrivedAt = now;
        }
        if (next == ShipmentStage.RECEIVED && receivedAt == null) {
            receivedAt = now;
        }
        return next;
    }

    /**
     * Whether the sellers should hear about {@code reached} now: only ARRIVED and RECEIVED, each once, and never an
     * ARRIVED after the RECEIVED was told.
     */
    public boolean claimNotice(ShipmentStage reached) {
        if (reached != ShipmentStage.ARRIVED && reached != ShipmentStage.RECEIVED) {
            return false;
        }
        if (reached.name().equals(notifiedStage) || ShipmentStage.RECEIVED.name().equals(notifiedStage)) {
            return false;
        }
        notifiedStage = reached.name();
        return true;
    }
}
