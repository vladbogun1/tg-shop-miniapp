package com.maxsolch.shop.domain;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

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

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
