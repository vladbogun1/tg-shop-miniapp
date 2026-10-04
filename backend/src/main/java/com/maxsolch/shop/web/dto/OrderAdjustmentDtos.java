package com.maxsolch.shop.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Admin corrections to an order: tracking number, recipient / delivery, returns. */
public final class OrderAdjustmentDtos {

    private OrderAdjustmentDtos() {
    }

    /** PATCH /api/admin/orders/{id}/tracking */
    public record UpdateTrackingRequest(@NotBlank @Size(max = 128) String trackingNumber) {
    }

    /**
     * PATCH /api/admin/orders/{id}/delivery — any field left null is not changed. City and branch
     * are sent together (refs from the Nova Poshta directory + display names).
     */
    public record UpdateDeliveryRequest(
            @Size(max = 255) String customerName,
            @Size(max = 64) String phone,
            @Size(max = 64) String npCityRef,
            @Size(max = 255) String npCityName,
            @Size(max = 64) String npWarehouseRef,
            @Size(max = 512) String npWarehouseName) {
    }

    /** POST /api/admin/orders/{id}/return */
    public record RegisterReturnRequest(
            @Valid List<ReturnLine> lines,
            /** Money given back now, minor units (0 = none). */
            Long refundMinor,
            @Size(max = 500) String note) {

        public record ReturnLine(long itemId, int quantity, Boolean restock) {
        }
    }
}
