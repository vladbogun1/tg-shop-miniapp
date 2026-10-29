package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import com.maxsolch.shop.platform.util.MoneyFormat;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "orders")
public class Order {

    /** {@link #getReturnStatus()}: the refused parcel is on its way back / has arrived. */
    public static final String RETURN_IN_TRANSIT = "IN_TRANSIT";
    public static final String RETURN_RECEIVED = "RECEIVED";

    /** Error code: shipping needs the online payment that has not arrived (the admin may confirm). */
    public static final String SHIP_UNPAID_CODE = "ORDER_UNPAID_SHIP";
    /** Shown when someone tries to reject an order the customer already received. */
    public static final String REJECT_DELIVERED =
            "Доставленный заказ не отклоняют — оформите «Возврат»: деньги и товар запишутся как надо";

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "subtotal_minor", nullable = false)
    private long subtotalMinor = 0;

    @Column(name = "discount_minor", nullable = false)
    private long discountMinor = 0;

    /** Gift case (V57): null = none, SEALED = the prize is in the order but not revealed, OPENED. */
    @Column(name = "gift_case_status", length = 16)
    private String giftCaseStatus;

    @Column(name = "gift_case_opened_at")
    private java.time.Instant giftCaseOpenedAt;

    /** Gift case tier of the order (V57): BRONZE | SILVER | GOLD — of its case or its guaranteed discount. */
    @Column(name = "gift_tier", length = 8)
    private String giftTier;

    /** Part of discountMinor the customer took as the tier's guaranteed discount instead of a case (V57). */
    @Column(name = "gift_discount_minor", nullable = false)
    private long giftDiscountMinor = 0;

    @Column(name = "total_minor", nullable = false)
    private long totalMinor;

    @Column(name = "promo_code", length = 64)
    private String promoCode;

    @Column(name = "currency", nullable = false, length = 8)
    private String currency = "UAH";

    @Column(name = "customer_name", nullable = false, length = 255)
    private String customerName;

    @Column(name = "phone", nullable = false, length = 64)
    private String phone;

    @Column(name = "comment", length = 1024)
    private String comment;

    /** Changes only through the transition methods below ({@link #approve}, {@link #ship}, ...). */
    @Setter(AccessLevel.NONE)
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderStatus status = OrderStatus.NEW;

    /** Where the order was placed: Mini App (default, everything before the site), site, admin. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false)
    private OrderSource source = OrderSource.MINIAPP;

    @Column(name = "tracking_number", length = 128)
    private String trackingNumber;

    @Column(name = "reject_reason", length = 1024)
    private String rejectReason;

    /** {@link RejectReasonCode} name; null = not specified (historical orders). */
    @Column(name = "reject_reason_code", length = 32)
    private String rejectReasonCode;

    /** Money given back to the customer (returns / cancelled prepaid orders). */
    @Column(name = "refunded_minor", nullable = false)
    private long refundedMinor = 0;

    /**
     * Paid value of the units refused at the Nova Poshta branch (partial pickup, V72): never
     * collected, so «Доставлен», наложка and the metrics count the total minus this.
     */
    @Column(name = "uncollected_minor", nullable = false)
    private long uncollectedMinor = 0;

    /** When the latest return was registered. */
    @Column(name = "returned_at")
    private Instant returnedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "shipped_at")
    private Instant shippedAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_method", nullable = false)
    private DeliveryMethod deliveryMethod = DeliveryMethod.NOVA_POSHTA;

    @Column(name = "np_city_ref", length = 64)
    private String npCityRef;

    @Column(name = "np_city_name", length = 255)
    private String npCityName;

    @Column(name = "np_warehouse_ref", length = 64)
    private String npWarehouseRef;

    @Column(name = "np_warehouse_name", length = 512)
    private String npWarehouseName;

    @Column(name = "payment_option_id", columnDefinition = "BINARY(16)")
    private byte[] paymentOptionId;

    @Column(name = "payment_option_title", length = 255)
    private String paymentOptionTitle;

    @Column(name = "paid", nullable = false)
    private boolean paid = false;

    @Column(name = "paid_at")
    private Instant paidAt;

    /**
     * Deadline to pay online (created + 24 h); an order still unpaid past it is rejected
     * automatically and restocked. Null = placed before online payment existed.
     */
    @Column(name = "payment_due_at")
    private Instant paymentDueAt;

    /** Prepayment amount snapshot for this order (0 for full-payment options). */
    @Column(name = "prepayment_minor", nullable = false)
    private long prepaymentMinor = 0;

    /** How much money has actually been received for this order (drives наложка/COD). */
    @Column(name = "received_minor", nullable = false)
    private long receivedMinor = 0;

    /** Customer's cancellation request of a paid order: PENDING | APPROVED | DECLINED, null = none. */
    @Column(name = "cancel_request_status", length = 16)
    private String cancelRequestStatus;

    @Column(name = "cancel_request_reason", length = 500)
    private String cancelRequestReason;

    @Column(name = "cancel_requested_at")
    private Instant cancelRequestedAt;

    @Column(name = "cancel_request_resolved_at")
    private Instant cancelRequestResolvedAt;

    /** Why the request was declined (shown to the customer), or a note on approval. */
    @Column(name = "cancel_request_admin_comment", length = 1000)
    private String cancelRequestAdminComment;

    /** Cancelled on the customer's initiative (feeds antibot.maxSelfCancelsPerDay). */
    @Column(name = "cancelled_by_customer", nullable = false)
    private boolean cancelledByCustomer = false;

    @Column(name = "tg_user_id")
    private Long tgUserId;

    @Column(name = "tg_username", length = 255)
    private String tgUsername;

    @Column(name = "notify_chat_id")
    private Long notifyChatId;

    @Column(name = "notify_thread_id")
    private Integer notifyThreadId;

    @Column(name = "notify_message_id")
    private Integer notifyMessageId;

    /** Message id of the seller dispatch ("К ОТПРАВКЕ") card, while the order is APPROVED. */
    @Column(name = "dispatch_message_id")
    private Integer dispatchMessageId;

    /**
     * Archived by the main admin (V68): hidden from the board, the lists and the customer's
     * history, kept with everything attached. Orders are never deleted.
     */
    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "archived_by", length = 255)
    private String archivedBy;

    @Column(name = "archive_reason", length = 500)
    private String archiveReason;

    /** Refused / sent-back parcel on its way to the shop (V68): IN_TRANSIT, then RECEIVED; null = none. */
    @Column(name = "return_status", length = 16)
    private String returnStatus;

    /** When the parcel (or the returned units) set off back to the shop: «едет назад» since. */
    @Column(name = "return_sent_at")
    private Instant returnSentAt;

    /** The order this one replaces goods of (V69): set on the replacement parcel of an exchange. */
    @Column(name = "exchange_of_order_id", columnDefinition = "BINARY(16)")
    private byte[] exchangeOfOrderId;

    /** The order this one was merged into (V71): closed as REJECTED with code MERGED, its lines live on there. */
    @Column(name = "merged_into_order_id", columnDefinition = "BINARY(16)")
    private byte[] mergedIntoOrderId;

    @Column(name = "return_received_at")
    private Instant returnReceivedAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    private List<OrderItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC, id ASC")
    private List<OrderMessage> messages = new ArrayList<>();

    // ----- state machine: the status moves only through these methods -----

    /** Not dispatched yet and not closed: the order can still be edited, cancelled, merged. */
    public boolean isOpen() {
        return OrderTransitions.isOpen(status);
    }

    /** Order composition/discount may only be edited before dispatch. */
    public void requireEditable() {
        if (!isOpen()) {
            throw OrderErrors.badRequest("заказ можно менять только в статусе «Новый» или «Одобрен»");
        }
    }

    public boolean isCancelRequestPending() {
        return CancelRequestStatus.PENDING.name().equals(cancelRequestStatus);
    }

    /** NEW → APPROVED. The dispatch card ("К ОТПРАВКЕ") is posted by the status listener after commit. */
    public void approve(Instant now) {
        if (!OrderTransitions.allowed(status, OrderStatus.APPROVED)) {
            throw OrderErrors.badRequest("одобрить можно только новый заказ");
        }
        requireNoPendingCancelRequest();
        status = OrderStatus.APPROVED;
        approvedAt = now;
    }

    /**
     * NEW/APPROVED → SHIPPED.
     *
     * @param allowUnpaid the admin confirmed shipping although the online payment (prepayment or the whole
     *                    order) has not arrived — e.g. agreed with the customer in the chat
     */
    public void ship(String trackingNumber, boolean allowUnpaid, Instant now) {
        if (!OrderTransitions.allowed(status, OrderStatus.SHIPPED)) {
            throw OrderErrors.badRequest("отправить можно только новый или одобренный заказ");
        }
        requireNoPendingCancelRequest();
        if (!allowUnpaid && OrderMoney.onlinePaymentMissing(this)) {
            throw OrderErrors.badRequest((prepaymentMinor > 0 ? "Предоплата" : "Онлайн-оплата")
                    + " по заказу #" + shortId() + " не пришла (не хватает "
                    + MoneyFormat.uah(OrderMoney.amountDueMinor(this)) + "). Отправить без неё можно только с подтверждением админа.",
                    SHIP_UNPAID_CODE);
        }
        status = OrderStatus.SHIPPED;
        shippedAt = now;
        if (trackingNumber != null && !trackingNumber.isBlank()) {
            this.trackingNumber = trackingNumber.trim();
        }
    }

    /**
     * SHIPPED → DELIVERED. Delivered means fully settled (COD collected on delivery + any prepayment): the
     * collectable amount counts as received, so наложка is 0 and it is never delivered-but-unpaid. Never
     * lowered: after an exchange for something cheaper the customer paid more than the new total, and the
     * metrics read that overpayment to tell a refunded difference from a return. Units refused at the
     * branch (partial pickup) were never paid for: left out.
     */
    public void deliver(Instant now) {
        if (!OrderTransitions.allowed(status, OrderStatus.DELIVERED)) {
            throw OrderErrors.badRequest("доставленным можно отметить только отправленный заказ");
        }
        status = OrderStatus.DELIVERED;
        deliveredAt = now;
        receivedMinor = Math.max(receivedMinor, OrderMoney.collectableMinor(this));
        if (!paid) {
            paid = true;
            paidAt = now;
        }
    }

    /** Throws when the order cannot be rejected at all (already rejected, or delivered — a return is a wizard). */
    public void requireRejectable() {
        if (!OrderTransitions.allowed(status, OrderStatus.REJECTED)) {
            if (status == OrderStatus.REJECTED) {
                throw OrderErrors.badRequest("заказ уже отклонён");
            }
            // Rejecting a delivered order used to keep its «получено» (the automatic full amount
            // set on delivery) — metrics then showed money that never was. A return records it right.
            throw OrderErrors.badRequest(REJECT_DELIVERED, "ORDER_DELIVERED_REJECT");
        }
    }

    /** NEW/APPROVED/SHIPPED → REJECTED with the reason; what the path did before (stock, money) is its own business. */
    public void reject(RejectCause cause) {
        requireRejectable();
        status = OrderStatus.REJECTED;
        rejectedAt = cause.at();
        rejectReason = cause.reason();
        rejectReasonCode = cause.reasonCode();
        if (cause.cancelledByCustomer()) {
            cancelledByCustomer = true;
        }
    }

    /** A refused parcel is on its way back: every line waits for the units not yet restocked (V68). */
    public void markReturnInTransit(Instant now) {
        returnStatus = RETURN_IN_TRANSIT;
        returnSentAt = now;
        for (OrderItem item : items) {
            item.setReturnPendingQty(Math.max(0, item.getQuantity() - item.getRestockedQty()));
        }
    }

    /** This order was merged into another (V71): closed as REJECTED with code MERGED, its lines live on there. */
    public void markMerged(Instant now, String reason, byte[] targetOrderId) {
        reject(new RejectCause(now, reason, RejectReasonCode.MERGED.name(), false));
        mergedIntoOrderId = targetOrderId;
        paymentDueAt = null;
    }

    /**
     * Nothing to pay: a discount (a case prize, a manual one) covers the whole order. It counts as paid at
     * once and has no payment deadline — otherwise it hung as «не оплачен» with a timer, and a NEW one was
     * auto-cancelled for non-payment. If an item is added later, the paid order asks for a top-up as usual.
     */
    public void settleIfFree(Instant now) {
        if (paid || totalMinor != 0 || items.isEmpty() || !isOpen()) {
            return;
        }
        paid = true;
        paidAt = now;
        paymentDueAt = null;
    }

    private void requireNoPendingCancelRequest() {
        if (isCancelRequestPending()) {
            // Approving or shipping would leave the customer's open request hanging (the inbox only
            // lists it for NEW/APPROVED) while the order card still offers «Одобрить и вернуть».
            throw OrderErrors.badRequest(
                    "покупатель просит отменить заказ — сначала примите или отклоните запрос отмены в карточке заказа");
        }
    }

    private String shortId() {
        String full = id == null ? "" : UuidUtil.toString(id);
        return full == null || full.length() < 8 ? String.valueOf(full) : full.substring(0, 8);
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
