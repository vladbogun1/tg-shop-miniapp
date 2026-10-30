package com.maxsolch.shop.order.app;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

import com.maxsolch.shop.order.app.OrderReturnsView.ExchangeDto;
import com.maxsolch.shop.order.app.OrderReturnsView.ReturnRecordDto;
import java.time.Instant;
import java.util.List;

@lombok.Builder
public record OrderDetailDto(
        String id,
        @Schema(implementation = com.maxsolch.shop.order.domain.OrderStatus.class) String status,
        long subtotalMinor,
        long discountMinor,
        long totalMinor,
        String currency,
        String customerName,
        String phone,
        @Nullable String comment,
        @Nullable String promoCode,
        @Schema(implementation = com.maxsolch.shop.order.domain.DeliveryMethod.class) @Nullable String deliveryMethod,
        @Nullable String npCityName,
        @Nullable String npWarehouseName,
        @Nullable String paymentOptionTitle,
        @Nullable String trackingNumber,
        @Nullable String rejectReason,
        List<OrderItemDto> items,
        /** Online payment (monobank) state — latest invoice; never null. */
        @Nullable OnlinePaymentDto payment,
        @Nullable Long tgUserId,
        @Nullable String tgUsername,
        Instant createdAt,
        @Nullable Instant approvedAt,
        @Nullable Instant shippedAt,
        @Nullable Instant deliveredAt,
        @Nullable Instant rejectedAt,
        boolean paid,
        @Nullable Instant paidAt,
        long prepaymentMinor,
        long receivedMinor,
        /** Pay online by then or the order is cancelled; null = order placed before online payment. */
        @Nullable Instant paymentDueAt,
        /** Still to pay online now (prepayment or total minus what arrived); 0 = nothing to pay. */
        long amountDueMinor,
        /** MINIAPP | WEB | ADMIN — where the order was placed. */
        @Schema(implementation = com.maxsolch.shop.order.domain.OrderSource.class) String source,
        /** uk | ru | en chosen by the customer in the shop (users.locale); null = never chose. */
        @Nullable String customerLocale,
        /** RejectReasonCode name, null = not specified. */
        @Nullable String rejectReasonCode,
        /** Money given back to the customer (returns). */
        long refundedMinor,
        @Nullable Instant returnedAt,
        /** Nova Poshta refs — the admin's delivery editor needs them to keep the address valid. */
        @Nullable String npCityRef,
        @Nullable String npWarehouseRef,
        /** Customer's cancellation request of a paid order: PENDING | APPROVED | DECLINED, null = none. */
        @Schema(implementation = com.maxsolch.shop.order.domain.CancelRequestStatus.class) @Nullable String cancelRequestStatus,
        @Nullable String cancelRequestReason,
        @Nullable Instant cancelRequestedAt,
        @Nullable Instant cancelRequestResolvedAt,
        /** Admin's answer (decline reason) shown to the customer. */
        @Nullable String cancelRequestAdminComment,
        /** Exchanges made on this order (V51), oldest first; empty when none. */
        List<ExchangeDto> exchanges,
        /** Gift case (V57): null = none, SEALED (the customer has not opened it; the prize line is hidden from them), OPENED. */
        @Nullable String giftCaseStatus,
        @Nullable Instant giftCaseOpenedAt,
        /** SEALED and the order is paid — the customer may open it now (once). */
        boolean giftCaseOpenable,
        /** Gift of the order (V57): tier, guaranteed discount or the case with its prize, code and swap; null = none. */
        @Nullable com.maxsolch.shop.order.app.OrderGiftDtos.OrderGiftDto gift,
        /** Part of discountMinor taken as the case tier's guaranteed discount (V57). */
        long giftDiscountMinor,
        /** Replacement of an exchange on that order (V69): the difference is paid online or наложкой. */
        @Nullable String exchangeOfId,
        /** Paid value of the units refused at the branch (partial pickup, V72): not part of наложка. */
        long uncollectedMinor,
        /** Admin only (V68): archive, money journal, write-offs, the parcel coming back; null for customers. */
        @Nullable AdminExtras admin) {

    @lombok.Builder
    public record AdminExtras(@Nullable Instant archivedAt,
                              @Nullable String archivedBy,
                              @Nullable String archiveReason,
                              /** IN_TRANSIT | RECEIVED | null — the refused parcel on its way back. */
                              @Nullable String returnStatus,
                              @Nullable Instant returnReceivedAt,
                              List<MovementDto> movements,
                              /** Sum of RETAINED rows: kept by the shop on purpose (delivery). */
                              long retainedMinor,
                              /** What can still go back to the card through monobank (all paid invoices). */
                              long monoRefundableMinor,
                              List<WriteoffDto> writeoffs,
                              /** This order replaces goods of that one (V69 exchange); null = not. */
                              @Nullable String exchangeOfId,
                              /** Replacement orders of exchanges made on this one, oldest first. */
                              List<String> exchangeOrderIds,
                              /** Returns and exchanges of this order (V70), oldest first. */
                              List<ReturnRecordDto> returns,
                              /** This order was merged into that one (V71); null = not. */
                              @Nullable String mergedIntoId,
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
                                    @Nullable String paymentOptionTitle,
                                    @Nullable String npCityName,
                                    @Nullable String npWarehouseName,
                                    @Nullable String customerName,
                                    @Nullable String trackingNumber,
                                    @Nullable String giftCaseStatus,
                                    List<String> lines,
                                    /** Why it cannot be merged now; null = it can. */
                                    @Nullable String blocker,
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
                              @Nullable String adminName,
                              @Nullable String note,
                              @Nullable String invoiceExtId,
                              String source) {
    }

    public record WriteoffDto(long id,
                              String title,
                              int quantity,
                              /** Of them: cancelled with the return or back on the shelf (V70). */
                              int undoneQty,
                              @Nullable String undoneNote,
                              String reason,
                              long unitValueMinor,
                              @Nullable String note,
                              @Nullable String adminName,
                              Instant createdAt) {
    }
}
