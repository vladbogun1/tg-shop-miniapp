package com.maxsolch.shop.customer.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * «Проблемный покупатель»: the admin marked this Telegram user (kept the parcel unpaid, vanished after it was sent).
 * The row exists while the mark is on; taking it off deletes the row (who did what is in the admin audit log).
 */
@Getter
@Setter
@Entity
@Table(name = "customer_flags")
public class CustomerFlag {

    @Id
    @Column(name = "telegram_user_id", nullable = false)
    private Long telegramUserId;

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;

    @Column(name = "flagged_at", nullable = false)
    private Instant flaggedAt;

    @Column(name = "flagged_by_admin_id")
    private Long flaggedByAdminId;
}
