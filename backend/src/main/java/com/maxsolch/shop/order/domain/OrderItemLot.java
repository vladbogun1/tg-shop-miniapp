package com.maxsolch.shop.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;

import java.time.Instant;

/** {@code qty} units of an order line taken from stock lot {@code lotId} (V74). */
@Getter
@Entity
@Table(name = "order_item_lots")
public class OrderItemLot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_item_id", nullable = false)
    private OrderItem item;

    @Column(name = "lot_id", nullable = false)
    private Long lotId;

    @Column(name = "qty", nullable = false)
    private int qty;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    static OrderItemLot of(OrderItem item, long lotId, int qty, Instant createdAt) {
        OrderItemLot a = new OrderItemLot();
        a.item = item;
        a.lotId = lotId;
        a.qty = qty;
        a.createdAt = createdAt;
        return a;
    }

    void changeQty(int newQty) {
        qty = newQty;
    }
}
