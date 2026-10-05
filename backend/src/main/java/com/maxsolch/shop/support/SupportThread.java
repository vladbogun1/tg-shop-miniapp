package com.maxsolch.shop.support;

import com.maxsolch.shop.domain.SenderType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A customer question to the shop that is not about an existing order (support, V43): about a
 * product before buying it, or a general one. The product is snapshotted (title, slug, image) so
 * the thread still reads correctly after the product is renamed or removed.
 */
@Getter
@Setter
@Entity
@Table(name = "support_threads")
public class SupportThread {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    /** users.telegram_user_id of the customer. */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tg_user_id")
    private Long tgUserId;

    @Column(name = "customer_name", length = 255)
    private String customerName;

    @Column(name = "product_id", columnDefinition = "BINARY(16)")
    private byte[] productId;

    @Column(name = "product_title", length = 255)
    private String productTitle;

    @Column(name = "product_slug", length = 255)
    private String productSlug;

    @Column(name = "product_image_url", length = 2048)
    private String productImageUrl;

    @Column(name = "subject", length = 255)
    private String subject;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SupportStatus status = SupportStatus.OPEN;

    /** MINIAPP | WEB. */
    @Column(name = "source", length = 16)
    private String source;

    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_sender")
    private SenderType lastSender;

    @Column(name = "last_preview", length = 255)
    private String lastPreview;

    /** Shop messages the customer has not read yet. */
    @Column(name = "customer_unread", nullable = false)
    private int customerUnread;

    /** Customer messages no admin has read yet. */
    @Column(name = "admin_unread", nullable = false)
    private int adminUnread;

    /** Oldest customer message still waiting for a shop answer; null = nobody is waiting. */
    @Column(name = "awaiting_since")
    private Instant awaitingSince;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    /** CUSTOMER | ADMIN | AUTO. */
    @Column(name = "closed_by", length = 16)
    private String closedBy;
}
