package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * One order line of a return record (V70). Units sent back by post (IN_TRANSIT) get their shelf /
 * write-off split when the parcel is received.
 */
@Getter
@Setter
@Entity
@Table(name = "order_return_lines")
public class OrderReturnLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "return_id", nullable = false)
    private Long returnId;

    @Column(name = "item_id", nullable = false)
    private long itemId;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "outcome", nullable = false, length = 16)
    private String outcome;

    @Column(name = "restocked_qty", nullable = false)
    private int restockedQty;

    @Column(name = "defect_qty", nullable = false)
    private int defectQty;

    @Column(name = "writeoff_id")
    private Long writeoffId;

    /** Units still on their way back (sent by post, not received yet). */
    public int pendingQty() {
        return "IN_TRANSIT".equals(outcome) ? Math.max(0, quantity - restockedQty - defectQty) : 0;
    }
}
