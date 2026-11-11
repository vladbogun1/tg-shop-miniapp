package com.maxsolch.shop.order.domain;

import java.util.Locale;

/**
 * How a Nova Poshta order is delivered to the customer ({@code orders.np_service_type}, V98).
 * {@link DeliveryMethod} stays NOVA_POSHTA for all three, so an older backend still reads new orders.
 */
public enum NpServiceType {
    /** Branch or partner point (відділення / пункт). */
    WAREHOUSE("WarehouseWarehouse"),
    /** Parcel locker (поштомат). */
    POSTOMAT("WarehousePostomat"),
    /** Courier to the address (кур'єр). */
    DOORS("WarehouseDoors");

    private final String npServiceType;

    NpServiceType(String npServiceType) {
        this.npServiceType = npServiceType;
    }

    /** {@code ServiceType} of InternetDocument.save / getDocumentPrice (we always hand over at a branch). */
    public String npServiceType() {
        return npServiceType;
    }

    /** Lenient parse; null/unknown = WAREHOUSE (orders placed before V98). */
    public static NpServiceType of(String raw) {
        if (raw == null || raw.isBlank()) {
            return WAREHOUSE;
        }
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return WAREHOUSE;
        }
    }

    /** Strict parse for request bodies: null when blank, IllegalArgumentException when unknown. */
    public static NpServiceType parseStrict(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return valueOf(raw.trim().toUpperCase(Locale.ROOT));
    }
}
