package com.maxsolch.shop.order.api;

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

    /**
     * POST /api/admin/orders/{id}/returns — the return wizard (V68): lines with their state,
     * manual refunds by channel, an optional refund through monobank, money the shop keeps.
     */
    public record ReturnWizardRequest(
            @Valid List<WizardLine> lines,
            @Valid List<Refund> refunds,
            /** Sent back to the card through monobank after the return is saved (null/0 = none). */
            Long monoRefundMinor,
            /** Kept by the shop on purpose — e.g. the prepayment that paid for delivery. */
            Long retainMinor,
            @Size(max = 500) String note,
            Boolean notifyCustomer) {

        /** outcome: RESTOCK (на склад) | DEFECT (брак, списать) | KEPT (осталось у покупателя). */
        public record WizardLine(long itemId, int quantity, String outcome) {
        }

        /** channel: NP_COD | NP_PAYMENT_CONTROL | CARD_TRANSFER | CASH | NP_CLAIM | OTHER. */
        public record Refund(String channel, long amountMinor, @Size(max = 500) String note) {
        }
    }

    /** POST /api/admin/orders/{id}/return-received — the refused parcel is back; DEFECT lines are written off. */
    public record ReceiveReturnRequest(
            @Valid List<ReturnWizardRequest.WizardLine> lines,
            @Size(max = 500) String note) {
    }

    /**
     * POST /api/admin/orders/{id}/returns/{returnId}/cancel — the customer changed their mind.
     * money: RETURNED (sent back already) | DEBT (owes it) | KEEP (left with them); reason required.
     */
    public record CancelReturnRequest(String money, @Size(max = 500) String note) {
    }

    /** POST /api/admin/stock-writeoffs/{id}/restore — a written-off unit goes back on the shelf. */
    /** Merge {@code sourceId} into the order of the URL (V71). */
    public record MergeRequest(@jakarta.validation.constraints.NotBlank String sourceId,
                               Boolean useSourceDelivery,
                               Boolean notifyCustomer,
                               @jakarta.validation.constraints.Size(max = 500) String note) {
    }

    public record RestoreWriteoffRequest(int quantity, @Size(max = 500) String note) {
    }

    /** POST /api/admin/orders/{id}/archive — main admin only. */
    public record ArchiveRequest(@Size(max = 500) String reason) {
    }

    /**
     * POST /api/admin/orders/{id}/exchange (delivered orders) — what the customer gives back
     * (outcome IN_TRANSIT = on its way by post, default; RESTOCK / DEFECT = already at the shop),
     * what goes out instead as a new linked order, and where that order starts: NEW (default) or APPROVED.
     */
    public record ExchangeRequest(
            @Valid List<ReturnWizardRequest.WizardLine> returned,
            @Valid List<NewLine> items,
            String targetStatus,
            Boolean notifyCustomer,
            @Size(max = 500) String note) {

        public record NewLine(@NotBlank String productId, String variantId, int quantity) {
        }
    }
}
