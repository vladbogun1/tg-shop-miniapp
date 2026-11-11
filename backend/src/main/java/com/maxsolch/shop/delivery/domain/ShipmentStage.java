package com.maxsolch.shop.delivery.domain;

/** Where a parcel is, in the shop's terms (order_shipments.stage). */
public enum ShipmentStage {
    /** Waybill exists, the parcel is not handed over yet (NP 1, 12). */
    CREATED,
    /** Accepted by NP and on its way (4, 41, 5, 6, 101, 104, 111, 112, …). */
    IN_TRANSIT,
    /** In the branch / parcel locker, waiting for the customer (7, 8). */
    ARRIVED,
    /** Picked up (9, 10, 11, 106) — final. */
    RECEIVED,
    /** The customer refused it (103) — goes back. */
    REFUSED,
    /** Coming back to us: return ordered, storage ended, disposal (102, 105, …). */
    RETURNING,
    /** The waybill was deleted (2) — final. */
    CANCELLED,
    /** NP does not know the number (3) — a typo or another cabinet's waybill. */
    NOT_FOUND;

    public static ShipmentStage of(String raw) {
        if (raw == null) {
            return CREATED;
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException e) {
            return CREATED;
        }
    }

    /** Nothing more can happen: stop polling. */
    public boolean terminal() {
        return this == RECEIVED || this == CANCELLED;
    }
}
