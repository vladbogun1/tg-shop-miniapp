package com.maxsolch.shop.payment.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.Set;

/**
 * One monobank invoice (payment page) for an order. An order can have several: a failed or expired
 * invoice is replaced by a new one when the customer presses "pay" again.
 */
@Getter
@Entity
@Table(name = "payment_invoices")
public class PaymentInvoice {

    public static final String PROVIDER_MONOBANK = "MONOBANK";

    public static final String CREATED = "created";
    public static final String PROCESSING = "processing";
    public static final String HOLD = "hold";
    public static final String SUCCESS = "success";
    public static final String FAILURE = "failure";
    public static final String REVERSED = "reversed";
    public static final String EXPIRED = "expired";

    /** Statuses that can still change on their own (worth polling). */
    public static final Set<String> OPEN = Set.of(CREATED, PROCESSING, HOLD);

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "provider", nullable = false, length = 16)
    private String provider = PROVIDER_MONOBANK;

    @Column(name = "external_id", nullable = false, length = 64)
    private String externalId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "final_amount_minor")
    private Long finalAmountMinor;

    /** Refunds of this invoice already booked into {@code orders.refunded_minor}. */
    @Column(name = "refunded_minor", nullable = false)
    private long refundedMinor = 0;

    @Column(name = "ccy", nullable = false)
    private int ccy = 980;

    @Column(name = "status", nullable = false, length = 16)
    private String status = CREATED;

    @Column(name = "page_url", nullable = false, length = 512)
    private String pageUrl;

    /** page | iframe — see V41. */
    @Column(name = "display_type", nullable = false, length = 8)
    private String displayType = "page";

    /** Basket sent with the invoice (JSON list of MonobankGateway.BasketItem), for refund receipts. */
    @Column(name = "basket_json", columnDefinition = "TEXT")
    private String basketJson;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** monobank modifiedDate of the state held here — webhooks may arrive out of order. */
    @Column(name = "provider_modified_at")
    private Instant providerModifiedAt;

    @Column(name = "failure_reason", length = 512)
    private String failureReason;

    @Column(name = "err_code", length = 16)
    private String errCode;

    @Column(name = "masked_pan", length = 32)
    private String maskedPan;

    @Column(name = "payment_method", length = 16)
    private String paymentMethod;

    @Column(name = "payment_system", length = 16)
    private String paymentSystem;

    @Column(name = "rrn", length = 64)
    private String rrn;

    @Column(name = "approval_code", length = 32)
    private String approvalCode;

    @Column(name = "fee_minor")
    private Long feeMinor;

    /** When the success was credited to the order — exactly once. */
    @Column(name = "applied_at")
    private Instant appliedAt;

    /** A refund was requested: the status is polled until this time. */
    @Column(name = "refund_pending_until")
    private Instant refundPendingUntil;

    /** Set by Hibernate on insert (the domain does not read the clock). */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Set by Hibernate on insert and on every real update. */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    /** A new invoice created at the provider: waiting for the payment until {@code expires}. */
    public static PaymentInvoice open(byte[] orderId, String externalId, long amountMinor, String pageUrl,
                                      String displayType, String basketJson, Instant expires) {
        PaymentInvoice i = new PaymentInvoice();
        i.orderId = orderId;
        i.externalId = externalId;
        i.amountMinor = amountMinor;
        i.pageUrl = pageUrl;
        i.displayType = displayType;
        i.basketJson = basketJson;
        i.expiresAt = expires;
        i.status = CREATED;
        return i;
    }

    public void noteProviderModified(Instant modified) {
        providerModifiedAt = modified;
    }

    /** A later "created/processing" never overwrites a final state of an invoice that was already applied. */
    public void moveTo(String newStatus) {
        if (!(appliedAt != null && OPEN.contains(newStatus))) {
            status = newStatus;
        }
    }

    public void noteFailure(String reason, String code) {
        failureReason = reason;
        errCode = code;
    }

    public void noteFinalAmount(long finalAmount) {
        finalAmountMinor = finalAmount;
    }

    /** What the bank reports about the card payment (already cut to the column widths). */
    public void noteCard(String pan, String method, String system, String reference, String approval, Long fee) {
        maskedPan = pan;
        paymentMethod = method;
        paymentSystem = system;
        rrn = reference;
        approvalCode = approval;
        feeMinor = fee;
    }

    /** The money was booked to the order: happens once. */
    public void markApplied(Instant now) {
        appliedAt = now;
    }

    /** The bank reports more refunded than we booked: the total only grows. */
    public void raiseRefunded(long refundedNow) {
        refundedMinor = Math.max(refundedMinor, refundedNow);
    }

    /** A refund was requested at the bank and is not confirmed yet. */
    public void awaitRefundUntil(Instant until) {
        refundPendingUntil = until;
    }

    public void clearRefundPending() {
        refundPendingUntil = null;
    }

    public boolean isOpen() {
        return OPEN.contains(status);
    }

    /** A live payment page the customer can still be sent to. */
    public boolean isPayable(Instant now) {
        return CREATED.equals(status) && expiresAt != null && expiresAt.isAfter(now.plusSeconds(60));
    }
}
