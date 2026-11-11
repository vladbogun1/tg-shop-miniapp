package com.maxsolch.shop.delivery.domain;

/** Events of the delivery module, consumed after commit. */
public final class ShipmentEvents {

    private ShipmentEvents() {
    }

    /** A parcel arrived at the branch: tell the customer once ({@code codMinor} = what they pay there). */
    public record Arrived(byte[] shipmentId) {
    }

    /** Paid storage starts soon: remind the customer once. */
    public record StorageSoon(byte[] shipmentId) {
    }
}
