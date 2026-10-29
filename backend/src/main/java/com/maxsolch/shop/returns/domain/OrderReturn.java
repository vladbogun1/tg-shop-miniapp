package com.maxsolch.shop.returns.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * One run of the return wizard or one exchange on an order (V70): what it did, so it can be
 * cancelled when the customer changes their mind. Never deleted — a cancellation is stamped on it.
 */
@Getter
@Setter
@Entity
@Table(name = "order_returns")
public class OrderReturn {

    public enum Kind {
        RETURN, EXCHANGE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "order_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] orderId;

    @Column(name = "kind", nullable = false, length = 16)
    private String kind = Kind.RETURN.name();

    @Column(name = "exchange_id")
    private Long exchangeId;

    @Column(name = "refund_minor", nullable = false)
    private long refundMinor;

    @Column(name = "refund_channel", length = 24)
    private String refundChannel;

    @Column(name = "mono_refund_minor", nullable = false)
    private long monoRefundMinor;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by", length = 255)
    private String cancelledBy;

    @Column(name = "cancel_note", length = 500)
    private String cancelNote;

    @Column(name = "debt_minor", nullable = false)
    private long debtMinor;

    @Column(name = "debt_paid_at")
    private Instant debtPaidAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /**
     * Why this record cannot be cancelled right now, or null. An exchange can only be undone while its
     * replacement has not shipped and holds no money beyond the moved credit.
     *
     * @param replacement the replacement order of an exchange (null for a plain return)
     */
    public String cancelBlocker(Order replacement) {
        if (cancelledAt != null) {
            return "уже отменён";
        }
        if (!Kind.EXCHANGE.name().equals(kind) || replacement == null) {
            return null;
        }
        String no = UuidUtil.toString(replacement.getId()).substring(0, 8);
        OrderStatus st = replacement.getStatus();
        if (st == OrderStatus.SHIPPED || st == OrderStatus.DELIVERED) {
            return "замену #" + no + " уже отправили — оформите «Возврат» в заказе #" + no;
        }
        long kept = OrderMoney.keptMinor(replacement);
        if (kept > refundMinor) {
            return "по замене #" + no + " уже доплатили " + MoneyFormat.uah(kept - refundMinor)
                    + " — отклоните заказ #" + no + " и верните эти деньги «Возвратом», потом отмените обмен";
        }
        return null;
    }

    /** How the customer sends a refund back: the way it went out; monobank refunds come back by transfer. */
    public OrderMoneyMovement.Channel backChannel() {
        if (refundMinor > 0 && refundChannel != null) {
            try {
                return OrderMoneyMovement.Channel.valueOf(refundChannel);
            } catch (IllegalArgumentException ignored) {
                // fall through
            }
        }
        return OrderMoneyMovement.Channel.CARD_TRANSFER;
    }
}
