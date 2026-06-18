package com.maxsolch.shop.domain;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "subtotal_minor", nullable = false)
    private long subtotalMinor = 0;

    @Column(name = "discount_minor", nullable = false)
    private long discountMinor = 0;

    @Column(name = "total_minor", nullable = false)
    private long totalMinor;

    @Column(name = "promo_code", length = 64)
    private String promoCode;

    @Column(name = "currency", nullable = false, length = 8)
    private String currency = "UAH";

    @Column(name = "customer_name", nullable = false, length = 255)
    private String customerName;

    @Column(name = "phone", nullable = false, length = 64)
    private String phone;

    @Column(name = "comment", length = 1024)
    private String comment;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderStatus status = OrderStatus.NEW;

    @Column(name = "tracking_number", length = 128)
    private String trackingNumber;

    @Column(name = "reject_reason", length = 1024)
    private String rejectReason;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "shipped_at")
    private Instant shippedAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_method", nullable = false)
    private DeliveryMethod deliveryMethod = DeliveryMethod.NOVA_POSHTA;

    @Column(name = "np_city_ref", length = 64)
    private String npCityRef;

    @Column(name = "np_city_name", length = 255)
    private String npCityName;

    @Column(name = "np_warehouse_ref", length = 64)
    private String npWarehouseRef;

    @Column(name = "np_warehouse_name", length = 512)
    private String npWarehouseName;

    @Column(name = "payment_option_id", columnDefinition = "BINARY(16)")
    private byte[] paymentOptionId;

    @Column(name = "payment_option_title", length = 255)
    private String paymentOptionTitle;

    @Column(name = "tg_user_id")
    private Long tgUserId;

    @Column(name = "tg_username", length = 255)
    private String tgUsername;

    @Column(name = "notify_chat_id")
    private Long notifyChatId;

    @Column(name = "notify_thread_id")
    private Integer notifyThreadId;

    @Column(name = "notify_message_id")
    private Integer notifyMessageId;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    private List<OrderItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC, id ASC")
    private List<OrderMessage> messages = new ArrayList<>();

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
