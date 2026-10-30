package com.maxsolch.shop.order.domain;

/** Where an order goes: the method and, for Nova Poshta, the city and the branch (all null for a pickup). */
public record DeliveryTarget(DeliveryMethod method, String npCityRef, String npCityName, String npWarehouseRef,
                             String npWarehouseName) {
}
