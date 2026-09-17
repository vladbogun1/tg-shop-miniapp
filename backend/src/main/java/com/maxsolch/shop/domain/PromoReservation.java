package com.maxsolch.shop.domain;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A limited promo code held for one customer while they finish their order.
 *
 * <p>The cart now validates the code and shows the discounted total right away, which opens a
 * window between "the shop promised me −20%" and "the order is placed". For a code with a usage
 * limit that window is a race: somebody else's checkout could take the last use, and the customer
 * would be told {@code invalid promo code} on the final step with no way to remove it. A
 * reservation closes the window for {@link com.maxsolch.shop.service.PromoService#HOLD} and is
 * released when it expires, when the customer clears the code, or when the order is created.
 *
 * <p>Unlimited codes are never reserved — there is nothing to run out of.
 */
@Getter
@Setter
@Entity
@Table(name = "promo_reservations")
public class PromoReservation {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "promo_code_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] promoCodeId;

    @Column(name = "telegram_user_id", nullable = false)
    private long telegramUserId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
