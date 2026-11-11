package com.maxsolch.shop.payment.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.Arrays;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "payment_options")
public class PaymentOption {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "description", length = 1024)
    private String description;

    @Column(name = "requires_prepayment", nullable = false)
    private boolean requiresPrepayment = false;

    @Column(name = "prepayment_minor", nullable = false)
    private long prepaymentMinor = 0;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    public static final String KIND_ON_DELIVERY = "ON_DELIVERY";

    /** Null = paid online (in full or a prepayment); {@code ON_DELIVERY} = all on delivery (V98). Set on create only. */
    @Column(name = "kind", length = 16)
    private String kind;

    /** CSV of {@code WAREHOUSE,POSTOMAT,DOORS,PICKUP} the option is offered for; null = all (V98). */
    @Column(name = "delivery_methods", length = 128)
    private String deliveryMethods;

    public boolean isOnDelivery() {
        return KIND_ON_DELIVERY.equals(kind);
    }

    /** The deliveries it is offered for; empty = all. */
    public List<String> deliveryMethodList() {
        if (deliveryMethods == null || deliveryMethods.isBlank()) {
            return List.of();
        }
        return Arrays.stream(deliveryMethods.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
