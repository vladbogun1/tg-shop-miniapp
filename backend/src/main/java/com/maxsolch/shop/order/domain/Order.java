package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

/**
 * The order aggregate: status, lines, discounts, what was received / refunded / left uncollected. The columns
 * are in {@link OrderColumns} (read-only outside), the request / archive / return-trail bookkeeping in {@link OrderHousekeeping}; every change goes through a method here, which keeps the
 * invariants: {@code total = subtotal - discount} (never below 0), {@code giftDiscount <= discount}, no negative
 * money, the status only along {@link OrderTransitions}. Calculations (to pay, COD, per-line shares) are pure
 * and live in {@link OrderMoney}.
 */
@Entity
@Table(name = "orders")
public class Order extends OrderHousekeeping {

    /** Shown when someone tries to reject an order the customer already received. */
    public static final String REJECT_DELIVERED =
            "Доставленный заказ не отклоняют — оформите «Возврат»: деньги и товар запишутся как надо";

    /** Lines are read here; they change only through {@link #addLine}, {@link #removeLine} and the line methods. */
    @Override
    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(items);
    }

    // ----- placing: who, where to, how it is paid -----

    /** The buyer and the contact of a new order; the source defaults to the Mini App. */
    public void placeBy(OrderBuyer buyer, OrderSource orderSource) {
        currency = "UAH";
        customerName = buyer.customerName();
        phone = buyer.phone();
        comment = buyer.comment();
        userId = buyer.userId();
        tgUserId = buyer.tgUserId();
        tgUsername = buyer.tgUsername();
        source = orderSource == null ? OrderSource.MINIAPP : orderSource;
    }

    /** Where the parcel goes: the method and (for Nova Poshta) the branch. */
    public void deliverTo(DeliveryTarget target) {
        deliveryMethod = target.method();
        npCityRef = target.npCityRef();
        npCityName = target.npCityName();
        npWarehouseRef = target.npWarehouseRef();
        npWarehouseName = target.npWarehouseName();
    }

    /** A new Nova Poshta branch for the same delivery method. */
    public void changeBranch(String cityRef, String cityName, String warehouseRef, String warehouseName) {
        npCityRef = cityRef;
        npCityName = cityName;
        npWarehouseRef = warehouseRef;
        npWarehouseName = warehouseName;
    }

    /** The snapshot of the chosen payment option; the clock to pay ends at {@code dueAt}. */
    public void choosePayment(byte[] optionId, String title, long prepayment, Instant dueAt) {
        paymentOptionId = optionId;
        paymentOptionTitle = title;
        prepaymentMinor = Math.max(0, prepayment);
        paymentDueAt = dueAt;
    }

    /** The online part is not capped by a prepayment snapshot any more (an exchange replacement). */
    public void dropPrepayment() {
        prepaymentMinor = 0;
    }

    /** No deadline to pay (an admin sale, a fully covered or merged order). */
    public void dropPaymentDeadline() {
        paymentDueAt = null;
    }

    public void rename(String name) {
        customerName = name;
    }

    public void changePhone(String newPhone) {
        phone = newPhone;
    }

    public void changeComment(String newComment) {
        comment = newComment;
    }

    public void changeTrackingNumber(String ttn) {
        trackingNumber = ttn;
    }

    /** The recipient and the address of {@code other} (a merged order): name, phone, method, branch. */
    public void takeRecipientOf(Order other) {
        customerName = other.customerName;
        phone = other.phone;
        deliverTo(new DeliveryTarget(other.deliveryMethod, other.npCityRef, other.npCityName,
                other.npWarehouseRef, other.npWarehouseName));
    }

    /** This order replaces goods of {@code original} (an exchange): the same customer. */
    public void replaces(Order original) {
        exchangeOfOrderId = original.id;
        userId = original.userId;
    }

    // ----- lines -----

    public void addLine(OrderItem line) {
        items.add(line);
    }

    public void removeLine(OrderItem line) {
        items.remove(line);
    }

    // ----- money: discounts and totals -----

    /** The label shown for the discount: a promo code, «Ручная скидка …», or none. */
    public void labelPromo(String label) {
        promoCode = label;
    }

    /**
     * Recount after the lines changed: the subtotal from the lines, the stored discount capped by it, the
     * gift part not above the discount, total = subtotal - discount. A free order is settled by
     * {@link #settleIfFree}.
     */
    public void reprice() {
        long subtotal = OrderMoney.subtotalMinor(this);
        subtotalMinor = subtotal;
        discountMinor = Math.min(Math.max(0, discountMinor), subtotal);
        giftDiscountMinor = Math.min(giftDiscountMinor, discountMinor);
        totalMinor = OrderMoney.totalMinor(subtotal, discountMinor);
    }

    /** First pricing of a new order: the discount of the promo, as it was computed against the subtotal. */
    public void priceWith(long discount) {
        subtotalMinor = OrderMoney.subtotalMinor(this);
        discountMinor = discount;
        totalMinor = OrderMoney.totalMinor(subtotalMinor, discountMinor);
    }

    /**
     * An admin's discount: the new one plus the guaranteed discount of the gift case (the customer chose it
     * instead of a case, it stays), both capped by the subtotal.
     */
    public void applyDiscount(long discount) {
        long subtotal = OrderMoney.subtotalMinor(this);
        subtotalMinor = subtotal;
        discountMinor = Math.min(Math.max(0, discount) + Math.max(0, giftDiscountMinor), subtotal);
        giftDiscountMinor = Math.min(giftDiscountMinor, discountMinor);
        totalMinor = OrderMoney.totalMinor(subtotal, discountMinor);
    }

    /** The tier's guaranteed discount, chosen instead of a case: comes off the order and is remembered. */
    public void grantGiftDiscount(String tier, long amountMinor) {
        giftTier = tier;
        giftDiscountMinor = amountMinor;
        discountMinor = Math.min(subtotalMinor, discountMinor + amountMinor);
        totalMinor = OrderMoney.totalMinor(subtotalMinor, discountMinor);
    }

    /** The discounts of a merged order add up: amounts, the gift part, the labels, the first tier. */
    public void absorbDiscountsOf(Order other, String joinedPromo) {
        discountMinor = discountMinor + other.discountMinor;
        giftDiscountMinor = giftDiscountMinor + other.giftDiscountMinor;
        promoCode = joinedPromo;
        if (giftTier == null) {
            giftTier = other.giftTier;
        }
    }

    // ----- gift case -----

    /** A case prize is drawn: the case waits sealed for the customer to open it. */
    public void sealGiftCase(String tier) {
        giftTier = tier;
        giftCaseStatus = GiftCaseRules.GIFT_CASE_SEALED;
        giftCaseOpenedAt = null;
    }

    public void openGiftCase(Instant now) {
        giftCaseStatus = GiftCaseRules.GIFT_CASE_OPENED;
        giftCaseOpenedAt = now;
    }

    /** The case prize left the order: no case to open; the tier stays only while a guaranteed discount holds it. */
    public void dropGiftCase() {
        giftCaseStatus = null;
        giftCaseOpenedAt = null;
        if (giftDiscountMinor <= 0) {
            giftTier = null;
        }
    }

    // ----- money: received, refunded, uncollected -----

    /** Throws when {@code amountMinor} cannot be the received sum: negative, or above the order total. */
    public void requireReceivable(long amountMinor) {
        if (amountMinor < 0) {
            throw new DomainException.BadRequest(OrderError.AMOUNT_NEGATIVE);
        }
        if (amountMinor > totalMinor) {
            // Used to be clamped silently: a typo (an extra zero) recorded "paid in full" unnoticed.
            throw new DomainException.BadRequest(OrderError.RECEIVED_EXCEEDS_TOTAL, MoneyFormat.uah(totalMinor));
        }
    }

    /**
     * The admin states how much was received (up or down). Paid = something received or a free order;
     * correcting an order that is already paid keeps the original payment date.
     */
    public void recordReceived(long amountMinor, Instant now) {
        requireReceivable(amountMinor);
        receivedMinor = amountMinor;
        boolean nowPaid = amountMinor > 0 || totalMinor == 0;
        boolean wasPaid = paid && paidAt != null;
        paid = nowPaid;
        paidAt = !nowPaid ? null : wasPaid ? paidAt : now;
    }

    /** What an online payment of {@code amountMinor} adds to «received»: never above the total. */
    public long creditableOnlineMinor(long amountMinor) {
        long before = Math.max(0, receivedMinor);
        return Math.max(0, Math.min(totalMinor, before + amountMinor) - before);
    }

    /** Money arrived online: added to «received» (capped by the total), the order becomes paid; the status stays. */
    public void receiveOnline(long amountMinor, Instant now) {
        receivedMinor = Math.min(totalMinor, Math.max(0, receivedMinor) + amountMinor);
        if (receivedMinor > 0 && !paid) {
            paid = true;
            paidAt = now;
        }
    }

    /** Money given back to the customer. */
    public void registerRefund(long amountMinor) {
        refundedMinor = Math.max(0, Math.max(0, refundedMinor) + amountMinor);
    }

    /** A refund is reversed (a cancelled return): «returned» goes down, never below 0. */
    public void undoRefund(long amountMinor) {
        refundedMinor = Math.max(0, refundedMinor - amountMinor);
    }

    /** Units refused at the branch (partial pickup) were never paid: their value leaves the collectable sum. */
    public void registerUncollected(long valueMinor) {
        uncollectedMinor = Math.max(0, uncollectedMinor) + valueMinor;
    }

    /** A cancelled return puts units back: that much is collected again. */
    public void restoreCollected(long valueMinor) {
        uncollectedMinor = Math.max(0, uncollectedMinor - valueMinor);
    }

    /** A merged order gave its refundable money over (no real money moves); the order counts as paid when covered. */
    public void absorbPaid(long moneyMinor, Order source, Instant now) {
        if (moneyMinor > 0) {
            receivedMinor = Math.max(0, receivedMinor) + moneyMinor;
        }
        boolean nowPaid = receivedMinor > 0 || totalMinor == 0;
        if (nowPaid && !paid) {
            paidAt = source.paidAt != null ? source.paidAt : now;
        }
        paid = nowPaid;
        if (nowPaid && OrderMoney.amountDueMinor(this) == 0) {
            paymentDueAt = null;
        }
    }

    // ----- state machine: the status moves only through these methods -----

    /** Not dispatched yet and not closed: the order can still be edited, cancelled, merged. */
    public boolean isOpen() {
        return OrderTransitions.isOpen(status);
    }

    /** Order composition/discount may only be edited before dispatch. */
    public void requireEditable() {
        if (!isOpen()) {
            throw new DomainException.BadRequest(OrderError.EDIT_STATUS_NOT_ALLOWED);
        }
    }

    public boolean isCancelRequestPending() {
        return CancelRequestStatus.PENDING.name().equals(cancelRequestStatus);
    }

    /** NEW → APPROVED. The dispatch card ("К ОТПРАВКЕ") is posted by the status listener after commit. */
    public void approve(Instant now) {
        if (!OrderTransitions.allowed(status, OrderStatus.APPROVED)) {
            throw new DomainException.BadRequest(OrderError.APPROVE_STATUS_NOT_ALLOWED);
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
    public void ship(String ttn, boolean allowUnpaid, Instant now) {
        if (!OrderTransitions.allowed(status, OrderStatus.SHIPPED)) {
            throw new DomainException.BadRequest(OrderError.SHIP_STATUS_NOT_ALLOWED);
        }
        requireNoPendingCancelRequest();
        if (!allowUnpaid && OrderMoney.onlinePaymentMissing(this)) {
            throw (prepaymentMinor > 0 ? new DomainException.BadRequest(OrderError.SHIP_PREPAYMENT_MISSING, String.valueOf(shortId()), MoneyFormat.uah(OrderMoney.amountDueMinor(this))) : new DomainException.BadRequest(OrderError.SHIP_ONLINE_PAYMENT_MISSING, String.valueOf(shortId()), MoneyFormat.uah(OrderMoney.amountDueMinor(this))));
        }
        status = OrderStatus.SHIPPED;
        shippedAt = now;
        if (ttn != null && !ttn.isBlank()) {
            trackingNumber = ttn.trim();
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
            throw new DomainException.BadRequest(OrderError.DELIVER_STATUS_NOT_ALLOWED);
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
                throw new DomainException.BadRequest(OrderError.ALREADY_REJECTED);
            }
            // Rejecting a delivered order used to keep its «получено» (the automatic full amount
            // set on delivery) — metrics then showed money that never was. A return records it right.
            throw new DomainException.BadRequest(OrderError.ORDER_DELIVERED_REJECT);
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
            item.awaitReturn();
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
            throw new DomainException.BadRequest(OrderError.CANCEL_REQUEST_PENDING);
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
