package com.maxsolch.shop.analytics.metrics;

import com.maxsolch.shop.domain.OrderStatus;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything the metrics calculators read, loaded once per request as lean rows (no entities).
 *
 * <p>The whole order history is a few thousand rows; loading it flat and aggregating in Java keeps
 * every calculator a pure function that can be unit-tested with hand-made rows, and lets one
 * definition ("sold" = not rejected, by creation date) be applied identically everywhere.
 */
public record MetricsFacts(List<OrderFact> orders,
                           List<ItemFact> items,
                           List<ProductFact> products,
                           List<UserFact> users,
                           List<InvoiceFact> invoices,
                           Instant now) {

    /** Without online-payment invoices (tests and callers that do not need them). */
    public MetricsFacts(List<OrderFact> orders, List<ItemFact> items, List<ProductFact> products,
                        List<UserFact> users, Instant now) {
        this(orders, items, products, users, List.of(), now);
    }

    /** How the order was to be paid: old manual transfers and monobank are reported apart. */
    public enum PaymentScheme {
        /** monobank acquiring (v3.9.0+), the whole amount online. */
        ONLINE_FULL("Онлайн monobank: полная оплата"),
        /** monobank acquiring, 100 грн online + the rest cash on delivery. */
        ONLINE_PREPAY("Онлайн monobank: предоплата + наложка"),
        /** Before v3.9.0: full transfer to the card / FOP account, confirmed by the admin. */
        CARD_FULL("Перевод на карту (старый): полная оплата"),
        /** Before v3.9.0: prepayment transferred to the card + cash on delivery. */
        CARD_PREPAY("Перевод на карту (старый): предоплата + наложка"),
        /** Before payment options existed (until June 2026): no option recorded. */
        NONE("Способ не записан (до июня 2026)");

        public final String label;

        PaymentScheme(String label) {
            this.label = label;
        }

        public boolean online() {
            return this == ONLINE_FULL || this == ONLINE_PREPAY;
        }
    }

    /**
     * One order. {@code refundedMinor}/{@code returnedAt}/{@code rejectReasonCode} come from columns
     * that package B adds; until they exist they are 0/null.
     *
     * <p>Online payment (v3.9.0): {@code paymentDueAt} is set on every order placed since then (it
     * is the 24 h deadline), so it tells a monobank order from an old manual-transfer one.
     * {@code onlinePaidMinor}/{@code onlinePaidAt} sum the credited monobank invoices,
     * {@code onlineRefundAt} is the last change of an invoice with a refund (monobank refunds do
     * not set {@code returnedAt}).
     */
    public record OrderFact(String id,
                            OrderStatus status,
                            String source,
                            long totalMinor,
                            long subtotalMinor,
                            long discountMinor,
                            long receivedMinor,
                            long refundedMinor,
                            Instant createdAt,
                            Instant approvedAt,
                            Instant shippedAt,
                            Instant deliveredAt,
                            Instant rejectedAt,
                            Instant paidAt,
                            Instant returnedAt,
                            boolean paid,
                            Long tgUserId,
                            String customerName,
                            String tgUsername,
                            String deliveryMethod,
                            String paymentOptionTitle,
                            String promoCode,
                            String rejectReason,
                            String rejectReasonCode,
                            long prepaymentMinor,
                            Instant paymentDueAt,
                            long onlinePaidMinor,
                            Instant onlinePaidAt,
                            Instant onlineRefundAt) {

        /** Before online payments: no prepayment snapshot, no deadline, no invoices. */
        public OrderFact(String id, OrderStatus status, String source, long totalMinor, long subtotalMinor,
                         long discountMinor, long receivedMinor, long refundedMinor, Instant createdAt,
                         Instant approvedAt, Instant shippedAt, Instant deliveredAt, Instant rejectedAt,
                         Instant paidAt, Instant returnedAt, boolean paid, Long tgUserId, String customerName,
                         String tgUsername, String deliveryMethod, String paymentOptionTitle, String promoCode,
                         String rejectReason, String rejectReasonCode) {
            this(id, status, source, totalMinor, subtotalMinor, discountMinor, receivedMinor, refundedMinor,
                    createdAt, approvedAt, shippedAt, deliveredAt, rejectedAt, paidAt, returnedAt, paid, tgUserId,
                    customerName, tgUsername, deliveryMethod, paymentOptionTitle, promoCode, rejectReason,
                    rejectReasonCode, 0, null, 0, null, null);
        }

        public boolean rejected() {
            return status == OrderStatus.REJECTED;
        }

        /** Placed with online payment (monobank): has the payment deadline or a credited invoice. */
        public boolean online() {
            return paymentDueAt != null || onlinePaidMinor > 0;
        }

        public PaymentScheme scheme() {
            if (online()) {
                return prepaymentMinor > 0 ? PaymentScheme.ONLINE_PREPAY : PaymentScheme.ONLINE_FULL;
            }
            if (prepaymentMinor > 0) {
                return PaymentScheme.CARD_PREPAY;
            }
            return paymentOptionTitle == null || paymentOptionTitle.isBlank() ? PaymentScheme.NONE
                    : PaymentScheme.CARD_FULL;
        }

        /**
         * An online order with nothing paid yet, whatever its status: not a sale. For online orders a
         * sale starts with the money (owner's rule, 2026-10): the full amount, or the 100 грн
         * prepayment for "prepay + COD". An admin approving / shipping it does not make it a sale;
         * delivering it does (delivery records the whole amount as received). Old manual-transfer
         * orders and orders without an online part are not affected.
         */
        public boolean awaitingPayment() {
            return online() && !rejected() && !paid && receivedMinor <= 0 && onlinePaidMinor <= 0;
        }

        /** Still NEW and unpaid online: within its 24 h, may yet be cancelled automatically. */
        public boolean awaitingPaymentNew() {
            return awaitingPayment() && status == OrderStatus.NEW;
        }

        /** Rejected automatically: the online payment deadline passed with nothing paid. */
        public boolean paymentTimedOut() {
            return rejected() && "PAYMENT_TIMEOUT".equals(rejectReasonCode);
        }

        /**
         * Counts as a sale: not rejected and not an unpaid online order still waiting for payment.
         * One definition for every tab (money, units, buyers, forecast, stock velocity).
         */
        public boolean sold() {
            return !rejected() && !awaitingPayment();
        }

        /**
         * Money in, split by when it actually arrived: the online / prepaid part at the payment date,
         * the cash-on-delivery rest at "Доставлен" (collected at Nova Poshta; delivering sets the
         * received amount to the total). Booking the whole order at the prepayment date moved COD
         * cash weeks back. For monobank orders the online part is exact (credited invoices), for old
         * manual-transfer prepayment orders it is the prepayment snapshot.
         *
         * @return {online / prepaid part at {@link #upfrontAt()}, COD part at {@code deliveredAt}}
         */
        public long[] receivedParts() {
            long received = Math.max(0, receivedMinor);
            if (received == 0) {
                return new long[] {0, 0};
            }
            long upfront = received;
            Instant at = upfrontAt();
            if (deliveredAt != null && at != null && at.isBefore(deliveredAt)) {
                if (onlinePaidMinor > 0) {
                    upfront = Math.min(onlinePaidMinor, received);
                } else if (prepaymentMinor > 0) {
                    upfront = Math.min(prepaymentMinor, received);
                }
            }
            return new long[] {upfront, received - upfront};
        }

        /** When the online / prepaid part arrived. */
        public Instant upfrontAt() {
            return onlinePaidAt != null ? onlinePaidAt : paidAt;
        }

        /** When the refund happened: the return date, the monobank refund, the rejection, the payment. */
        public Instant refundedAt() {
            if (returnedAt != null) {
                return returnedAt;
            }
            if (onlineRefundAt != null) {
                return onlineRefundAt;
            }
            return rejectedAt != null ? rejectedAt : paidAt;
        }

        /**
         * Sold amount net of refunds: {@code total − refunds}, where a refund that only gives back an
         * overpayment does not count. An admin who removes an item from a paid order lowers the total
         * AND refunds the difference — subtracting that refund again would count the removal twice.
         * The overpayment is what was paid above the current total: the credited monobank invoices
         * (exact, survive "Доставлен" resetting the received amount) or the received amount.
         * Zero for orders that are not sold.
         */
        public long soldMinor() {
            if (!sold()) {
                return 0;
            }
            long total = Math.max(0, totalMinor);
            long overpaid = Math.max(0, Math.max(receivedMinor, onlinePaidMinor) - total);
            long returned = Math.max(0, refundedMinor - overpaid);
            return Math.max(0, total - Math.min(total, returned));
        }

        /** Share of the order's item prices that stays sold: promo discount and refunds applied. */
        public double soldShare() {
            if (totalMinor <= 0) {
                return sold() ? chargedShare() : 0;
            }
            return chargedShare() * soldMinor() / (double) totalMinor;
        }

        /** Share of the item prices actually charged after the promo discount (1 when unknown). */
        public double chargedShare() {
            if (subtotalMinor <= 0) {
                return 1.0;
            }
            return Math.max(0.0, Math.min(1.0, (double) (subtotalMinor - discountMinor) / subtotalMinor));
        }
    }

    public record ItemFact(String orderId,
                           String productId,
                           String variantId,
                           String title,
                           String variantName,
                           long priceMinor,
                           int quantity,
                           boolean gift) {
    }

    public record VariantFact(String id, String name, int stock) {
    }

    public record ProductFact(String id,
                              String title,
                              long priceMinor,
                              int stock,
                              boolean active,
                              boolean archived,
                              Instant createdAt,
                              List<String> tags,
                              List<VariantFact> variants) {

        /** On the storefront: active and not archived. */
        public boolean live() {
            return active && !archived;
        }
    }

    public record UserFact(long telegramUserId, Instant createdAt) {
    }

    /**
     * One monobank invoice ({@code payment_invoices}). {@code status} is monobank's: created |
     * processing | hold | success | failure | reversed | expired; {@code appliedAt} = when a success
     * was credited to the order.
     */
    public record InvoiceFact(String orderId,
                              String status,
                              long amountMinor,
                              long refundedMinor,
                              long feeMinor,
                              Instant createdAt,
                              Instant appliedAt,
                              Instant updatedAt) {

        public boolean credited() {
            return appliedAt != null;
        }

        /** Ended without money: declined, or the payment page expired unpaid. */
        public boolean failedOrExpired() {
            return !credited() && ("failure".equals(status) || "expired".equals(status));
        }
    }

    public Map<String, OrderFact> orderById() {
        Map<String, OrderFact> map = new HashMap<>(orders.size() * 2);
        for (OrderFact o : orders) {
            map.put(o.id(), o);
        }
        return map;
    }

    public Map<String, ProductFact> productById() {
        Map<String, ProductFact> map = new HashMap<>(products.size() * 2);
        for (ProductFact p : products) {
            map.put(p.id(), p);
        }
        return map;
    }
}
