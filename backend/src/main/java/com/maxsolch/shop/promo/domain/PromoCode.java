package com.maxsolch.shop.promo.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter(AccessLevel.PACKAGE)
@Entity
@Table(name = "promo_codes")
public class PromoCode {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "code", nullable = false, length = 64)
    private String code;

    @Column(name = "discount_percent", nullable = false)
    private int discountPercent = 0;

    @Column(name = "discount_amount_minor", nullable = false)
    private long discountAmountMinor = 0;

    /** Ceiling of the discount in kopecks (V63): "5 %, but at most 100 ₴"; 0 = no ceiling. */
    @Column(name = "max_discount_minor", nullable = false)
    private long maxDiscountMinor = 0;

    /** The kind of discount this code gives (see {@link DiscountKind}). */
    public DiscountKind kind() {
        if (discountAmountMinor > 0) {
            return DiscountKind.FIXED;
        }
        return discountPercent > 0 ? DiscountKind.PERCENT : DiscountKind.NONE;
    }

    @Column(name = "max_uses")
    private Integer maxUses;

    @Column(name = "uses_count", nullable = false)
    private int usesCount = 0;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    /** Personal code (V44): only this customer (telegram user id) may use it; null = anyone. */
    @Column(name = "owner_user_id")
    private Long ownerUserId;

    /** Last moment the code is valid (V44); null = no expiry. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Where the code came from, e.g. {@link #SOURCE_REVIEW_BONUS}; null = made by an admin. */
    @Column(name = "source", length = 32)
    private String source;

    /** The order a generated code was issued for (review bonus). */
    @Column(name = "source_order_id", columnDefinition = "BINARY(16)")
    private byte[] sourceOrderId;

    public static final String SOURCE_REVIEW_BONUS = "REVIEW_BONUS";
    /** A code the gift case gave (a discount prize or the swap of a product prize). */
    public static final String SOURCE_GIFT_CASE = "GIFT_CASE";

    /** A percent as the code may hold it: 0..100 (a "150 %" code is not a thing). */
    public static int clampPercent(int percent) {
        return percent > 0 ? Math.min(100, percent) : 0;
    }

    /** An admin's code: no owner, no expiry. The discount is set by {@link #edit}. */
    public static PromoCode named(String code) {
        PromoCode p = new PromoCode();
        p.code = code;
        return p;
    }

    /**
     * A personal single-use code (the gift case, the review bonus): only {@code ownerUserId} may use it, once,
     * until {@code expiresAt}. A percent wins over a fixed amount; the percent is held to 100.
     */
    public static PromoCode personalOneTime(String code, Long ownerUserId, int percent, long amountMinor,
                                            long maxDiscountMinor, Instant expiresAt, String source,
                                            byte[] sourceOrderId) {
        PromoCode p = new PromoCode();
        p.code = code;
        p.discountPercent = clampPercent(percent);
        p.discountAmountMinor = percent > 0 ? 0 : Math.max(0, amountMinor);
        p.maxDiscountMinor = maxDiscountMinor;
        p.maxUses = 1;
        p.usesCount = 0;
        p.active = true;
        p.ownerUserId = ownerUserId;
        p.expiresAt = expiresAt;
        p.source = source;
        p.sourceOrderId = sourceOrderId;
        return p;
    }

    /**
     * An admin's edit of the discount. {@code maxDiscountMinor} and {@code active} are left as they are when
     * null. (The percent is not clamped here: the admin form validates it, and {@link PromoDiscount} caps at 100.)
     */
    public void edit(int percent, long amountMinor, Integer maxUses, Long maxDiscountMinor, Boolean active) {
        this.discountPercent = percent;
        this.discountAmountMinor = amountMinor;
        this.maxUses = maxUses;
        if (maxDiscountMinor != null) {
            this.maxDiscountMinor = maxDiscountMinor;
        }
        if (active != null) {
            this.active = active;
        }
    }

    public void rename(String newCode) {
        this.code = newCode;
    }

    /** Switches the code off (a rejected order's case promo). */
    public void deactivate() {
        this.active = false;
    }

    /** One more use; the caller holds the row lock and has checked the limit. */
    public void countUse() {
        usesCount++;
    }

    /** Gives one use back (order cancelled or edited); a code with no uses is left alone. */
    public boolean giveBackUse() {
        if (usesCount <= 0) {
            return false;
        }
        usesCount--;
        return true;
    }

    /** Expired at {@code now}: {@code expires_at} reached. */
    public boolean isExpiredAt(Instant now) {
        return expiresAt != null && !expiresAt.isAfter(now);
    }

    /** May this customer use the code? Ownerless codes are for everyone; personal ones only for the owner. */
    public boolean usableBy(Long userId) {
        return ownerUserId == null || (userId != null && ownerUserId.equals(userId));
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
