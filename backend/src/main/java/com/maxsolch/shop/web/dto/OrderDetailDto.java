package com.maxsolch.shop.web.dto;

import java.time.Instant;
import java.util.List;

public record OrderDetailDto(
        String id,
        String status,
        long subtotalMinor,
        long discountMinor,
        long totalMinor,
        String currency,
        String customerName,
        String phone,
        String comment,
        String promoCode,
        String deliveryMethod,
        String npCityName,
        String npWarehouseName,
        String paymentOptionTitle,
        String trackingNumber,
        String rejectReason,
        List<OrderItemDto> items,
        /** Online payment (monobank) state — latest invoice; never null. */
        OnlinePaymentDto payment,
        Long tgUserId,
        String tgUsername,
        Instant createdAt,
        Instant approvedAt,
        Instant shippedAt,
        Instant deliveredAt,
        Instant rejectedAt,
        boolean paid,
        Instant paidAt,
        long prepaymentMinor,
        long receivedMinor,
        /** Pay online by then or the order is cancelled; null = order placed before online payment. */
        Instant paymentDueAt,
        /** Still to pay online now (prepayment or total minus what arrived); 0 = nothing to pay. */
        long amountDueMinor,
        /** MINIAPP | WEB | ADMIN — where the order was placed. */
        String source,
        /** uk | ru | en chosen by the customer in the shop (users.locale); null = never chose. */
        String customerLocale,
        /** RejectReasonCode name, null = not specified. */
        String rejectReasonCode,
        /** Money given back to the customer (returns). */
        long refundedMinor,
        Instant returnedAt,
        /** Nova Poshta refs — the admin's delivery editor needs them to keep the address valid. */
        String npCityRef,
        String npWarehouseRef,
        /** Customer's cancellation request of a paid order: PENDING | APPROVED | DECLINED, null = none. */
        String cancelRequestStatus,
        String cancelRequestReason,
        Instant cancelRequestedAt,
        Instant cancelRequestResolvedAt,
        /** Admin's answer (decline reason) shown to the customer. */
        String cancelRequestAdminComment,
        /** Exchanges made on this order (V51), oldest first; empty when none. */
        List<ExchangeDto> exchanges,
        /** Gift case (V57): null = none, SEALED (the customer has not opened it; the prize line is hidden from them), OPENED. */
        String giftCaseStatus,
        Instant giftCaseOpenedAt,
        /** SEALED and the order is paid — the customer may open it now (once). */
        boolean giftCaseOpenable,
        /** Gift of the order (V57): tier, guaranteed discount or the case with its prize, code and swap; null = none. */
        com.maxsolch.shop.gift.GiftDtos.OrderGiftDto gift,
        /** Part of discountMinor taken as the case tier's guaranteed discount (V57). */
        long giftDiscountMinor,
        /** Admin only (V68): archive, money journal, write-offs, the parcel coming back; null for customers. */
        AdminExtras admin) {

    public record AdminExtras(Instant archivedAt,
                              String archivedBy,
                              String archiveReason,
                              /** IN_TRANSIT | RECEIVED | null — the refused parcel on its way back. */
                              String returnStatus,
                              Instant returnReceivedAt,
                              List<MovementDto> movements,
                              /** Sum of RETAINED rows: kept by the shop on purpose (delivery). */
                              long retainedMinor,
                              /** What can still go back to the card through monobank (all paid invoices). */
                              long monoRefundableMinor,
                              List<WriteoffDto> writeoffs) {
    }

    public record MovementDto(long id,
                              String kind,
                              String channel,
                              long amountMinor,
                              Instant occurredAt,
                              String adminName,
                              String note,
                              String invoiceExtId,
                              String source) {
    }

    public record WriteoffDto(String title,
                              int quantity,
                              String reason,
                              long unitValueMinor,
                              String note,
                              String adminName,
                              Instant createdAt) {
    }

    public record ExchangeDto(Instant createdAt,
                              String previousStatus,
                              String previousTracking,
                              String returnedSummary,
                              String givenSummary,
                              long totalBeforeMinor,
                              long totalAfterMinor,
                              String note,
                              String adminName) {
    }
}
