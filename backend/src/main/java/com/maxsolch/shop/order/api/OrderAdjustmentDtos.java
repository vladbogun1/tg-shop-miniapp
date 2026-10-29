package com.maxsolch.shop.order.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Admin corrections to an order: tracking number, recipient / delivery, merge, archive. */
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

    /** Merge {@code sourceId} into the order of the URL (V71). */
    public record MergeRequest(@jakarta.validation.constraints.NotBlank String sourceId,
                               Boolean useSourceDelivery,
                               Boolean notifyCustomer,
                               @jakarta.validation.constraints.Size(max = 500) String note) {
    }

    /** POST /api/admin/orders/{id}/archive — main admin only. */
    public record ArchiveRequest(@Size(max = 500) String reason) {
    }
}
