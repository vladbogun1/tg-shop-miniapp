package com.maxsolch.shop.order.domain;

/**
 * Where an order goes: the method and, for Nova Poshta, the city, how it is delivered ({@link NpServiceType}) and
 * the branch / parcel locker or the courier address (all null for a pickup). {@code serviceType} null = an order
 * placed before V98 (read as WAREHOUSE).
 */
public record DeliveryTarget(DeliveryMethod method, String npCityRef, String npCityName, String npWarehouseRef,
                             String npWarehouseName, NpServiceType serviceType, String npStreetRef,
                             String npStreetName, String npBuilding, String npFlat) {

    /** A branch delivery the old way: no service type, no courier address. */
    public DeliveryTarget(DeliveryMethod method, String npCityRef, String npCityName, String npWarehouseRef,
                          String npWarehouseName) {
        this(method, npCityRef, npCityName, npWarehouseRef, npWarehouseName, null, null, null, null, null);
    }
}
