package com.maxsolch.shop.promo.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
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
