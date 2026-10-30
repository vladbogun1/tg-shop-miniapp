package com.maxsolch.shop.order.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import lombok.Getter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * The columns of {@code orders} and nothing else: read access for everyone, no setters, and the fields are
 * {@code protected} so that only {@link Order} (the aggregate that owns the invariants) writes them. All the
 * behaviour lives in {@link Order}; the split keeps both files readable.
 */
@Getter
@MappedSuperclass
public abstract class OrderColumns {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    protected byte[] id;

    @Column(name = "user_id")
    protected Long userId;

    @Column(name = "subtotal_minor", nullable = false)
    protected long subtotalMinor = 0;

    @Column(name = "discount_minor", nullable = false)
    protected long discountMinor = 0;

    /** Gift case (V57): null = none, SEALED = the prize is in the order but not revealed, OPENED. */
    @Column(name = "gift_case_status", length = 16)
    protected String giftCaseStatus;

    @Column(name = "gift_case_opened_at")
    protected java.time.Instant giftCaseOpenedAt;

    /** Gift case tier of the order (V57): BRONZE | SILVER | GOLD — of its case or its guaranteed discount. */
    @Column(name = "gift_tier", length = 8)
    protected String giftTier;

    /** Part of discountMinor the customer took as the tier's guaranteed discount instead of a case (V57). */
    @Column(name = "gift_discount_minor", nullable = false)
    protected long giftDiscountMinor = 0;

    @Column(name = "total_minor", nullable = false)
    protected long totalMinor;

    @Column(name = "promo_code", length = 64)
    protected String promoCode;

    @Column(name = "currency", nullable = false, length = 8)
    protected String currency = "UAH";

    @Column(name = "customer_name", nullable = false, length = 255)
    protected String customerName;

    @Column(name = "phone", nullable = false, length = 64)
    protected String phone;

    @Column(name = "comment", length = 1024)
    protected String comment;

    /** Changes only through the transition methods of {@link Order} ({@code approve}, {@code ship}, ...). */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    protected OrderStatus status = OrderStatus.NEW;

    /** Where the order was placed: Mini App (default, everything before the site), site, admin. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false)
    protected OrderSource source = OrderSource.MINIAPP;

    @Column(name = "tracking_number", length = 128)
    protected String trackingNumber;

    @Column(name = "reject_reason", length = 1024)
    protected String rejectReason;

    /** {@link RejectReasonCode} name; null = not specified (historical orders). */
    @Column(name = "reject_reason_code", length = 32)
    protected String rejectReasonCode;

    /** Money given back to the customer (returns / cancelled prepaid orders). */
    @Column(name = "refunded_minor", nullable = false)
    protected long refundedMinor = 0;

    /**
     * Paid value of the units refused at the Nova Poshta branch (partial pickup, V72): never
     * collected, so «Доставлен», наложка and the metrics count the total minus this.
     */
    @Column(name = "uncollected_minor", nullable = false)
    protected long uncollectedMinor = 0;

    /** When the latest return was registered. */
    @Column(name = "returned_at")
    protected Instant returnedAt;

    @Column(name = "approved_at")
    protected Instant approvedAt;

    @Column(name = "shipped_at")
    protected Instant shippedAt;

    @Column(name = "delivered_at")
    protected Instant deliveredAt;

    @Column(name = "rejected_at")
    protected Instant rejectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_method", nullable = false)
    protected DeliveryMethod deliveryMethod = DeliveryMethod.NOVA_POSHTA;

    @Column(name = "np_city_ref", length = 64)
    protected String npCityRef;

    @Column(name = "np_city_name", length = 255)
    protected String npCityName;

    @Column(name = "np_warehouse_ref", length = 64)
    protected String npWarehouseRef;

    @Column(name = "np_warehouse_name", length = 512)
    protected String npWarehouseName;

    @Column(name = "payment_option_id", columnDefinition = "BINARY(16)")
    protected byte[] paymentOptionId;

    @Column(name = "payment_option_title", length = 255)
    protected String paymentOptionTitle;

    @Column(name = "paid", nullable = false)
    protected boolean paid = false;

    @Column(name = "paid_at")
    protected Instant paidAt;

    /**
     * Deadline to pay online (created + 24 h); an order still unpaid past it is rejected
     * automatically and restocked. Null = placed before online payment existed.
     */
    @Column(name = "payment_due_at")
    protected Instant paymentDueAt;

    /** Prepayment amount snapshot for this order (0 for full-payment options). */
    @Column(name = "prepayment_minor", nullable = false)
    protected long prepaymentMinor = 0;

    /** How much money has actually been received for this order (drives наложка/COD). */
    @Column(name = "received_minor", nullable = false)
    protected long receivedMinor = 0;

    /** Customer's cancellation request of a paid order: PENDING | APPROVED | DECLINED, null = none. */
    @Column(name = "cancel_request_status", length = 16)
    protected String cancelRequestStatus;

    @Column(name = "cancel_request_reason", length = 500)
    protected String cancelRequestReason;

    @Column(name = "cancel_requested_at")
    protected Instant cancelRequestedAt;

    @Column(name = "cancel_request_resolved_at")
    protected Instant cancelRequestResolvedAt;

    /** Why the request was declined (shown to the customer), or a note on approval. */
    @Column(name = "cancel_request_admin_comment", length = 1000)
    protected String cancelRequestAdminComment;

    /** Cancelled on the customer's initiative (feeds antibot.maxSelfCancelsPerDay). */
    @Column(name = "cancelled_by_customer", nullable = false)
    protected boolean cancelledByCustomer = false;

    @Column(name = "tg_user_id")
    protected Long tgUserId;

    @Column(name = "tg_username", length = 255)
    protected String tgUsername;

    @Column(name = "notify_chat_id")
    protected Long notifyChatId;

    @Column(name = "notify_thread_id")
    protected Integer notifyThreadId;

    @Column(name = "notify_message_id")
    protected Integer notifyMessageId;

    /** Message id of the seller dispatch ("К ОТПРАВКЕ") card, while the order is APPROVED. */
    @Column(name = "dispatch_message_id")
    protected Integer dispatchMessageId;

    /**
     * Archived by the main admin (V68): hidden from the board, the lists and the customer's
     * history, kept with everything attached. Orders are never deleted.
     */
    @Column(name = "archived_at")
    protected Instant archivedAt;

    @Column(name = "archived_by", length = 255)
    protected String archivedBy;

    @Column(name = "archive_reason", length = 500)
    protected String archiveReason;

    /** Refused / sent-back parcel on its way to the shop (V68): IN_TRANSIT, then RECEIVED; null = none. */
    @Column(name = "return_status", length = 16)
    protected String returnStatus;

    /** When the parcel (or the returned units) set off back to the shop: «едет назад» since. */
    @Column(name = "return_sent_at")
    protected Instant returnSentAt;

    /** The order this one replaces goods of (V69): set on the replacement parcel of an exchange. */
    @Column(name = "exchange_of_order_id", columnDefinition = "BINARY(16)")
    protected byte[] exchangeOfOrderId;

    /** The order this one was merged into (V71): closed as REJECTED with code MERGED, its lines live on there. */
    @Column(name = "merged_into_order_id", columnDefinition = "BINARY(16)")
    protected byte[] mergedIntoOrderId;

    @Column(name = "return_received_at")
    protected Instant returnReceivedAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    protected Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    protected Instant updatedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    protected List<OrderItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC, id ASC")
    protected List<OrderMessage> messages = new ArrayList<>();
}
