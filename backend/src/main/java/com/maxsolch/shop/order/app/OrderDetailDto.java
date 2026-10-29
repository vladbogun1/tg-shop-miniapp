package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.app.OrderReturnsView.ExchangeDto;
import com.maxsolch.shop.order.app.OrderReturnsView.ReturnRecordDto;
import com.maxsolch.shop.order.app.OnlinePaymentDto;
import java.time.Instant;
import java.util.List;

@lombok.Builder
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
        /** Replacement of an exchange on that order (V69): the difference is paid online or наложкой. */
        String exchangeOfId,
        /** Paid value of the units refused at the branch (partial pickup, V72): not part of наложка. */
        long uncollectedMinor,
        /** Admin only (V68): archive, money journal, write-offs, the parcel coming back; null for customers. */
        AdminExtras admin) {

    @lombok.Builder
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
                              List<WriteoffDto> writeoffs,
                              /** This order replaces goods of that one (V69 exchange); null = not. */
                              String exchangeOfId,
                              /** Replacement orders of exchanges made on this one, oldest first. */
                              List<String> exchangeOrderIds,
                              /** Returns and exchanges of this order (V70), oldest first. */
                              List<ReturnRecordDto> returns,
                              /** This order was merged into that one (V71); null = not. */
                              String mergedIntoId,
                              /** Orders merged into this one, oldest first. */
                              List<String> mergedFromIds) {
    }

    /** Another open order of the same customer for «Объединить» (V71) and the merged result. */
    @lombok.Builder
    public record MergeCandidateDto(String id,
                                    String status,
                                    Instant createdAt,
                                    long totalMinor,
                                    long receivedMinor,
                                    long prepaymentMinor,
                                    boolean paid,
                                    String paymentOptionTitle,
                                    String npCityName,
                                    String npWarehouseName,
                                    String customerName,
                                    String trackingNumber,
                                    String giftCaseStatus,
                                    List<String> lines,
                                    /** Why it cannot be merged now; null = it can. */
                                    String blocker,
                                    /** The order that stays, after the merge. */
                                    long mergedTotalMinor,
                                    long mergedReceivedMinor,
                                    long mergedAmountDueMinor,
                                    long mergedCodMinor) {
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

    public record WriteoffDto(long id,
                              String title,
                              int quantity,
                              /** Of them: cancelled with the return or back on the shelf (V70). */
                              int undoneQty,
                              String undoneNote,
                              String reason,
                              long unitValueMinor,
                              String note,
                              String adminName,
                              Instant createdAt) {
    }
}
