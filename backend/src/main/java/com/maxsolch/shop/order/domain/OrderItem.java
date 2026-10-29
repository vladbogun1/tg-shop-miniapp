package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.domain.OrderItemLot;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @Column(name = "product_id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] productId;

    @Column(name = "title_snapshot", nullable = false, length = 255)
    private String titleSnapshot;

    @Column(name = "price_minor_snapshot", nullable = false)
    private long priceMinorSnapshot;

    @Column(name = "variant_id", columnDefinition = "BINARY(16)")
    private byte[] variantId;

    @Column(name = "variant_name_snapshot", length = 128)
    private String variantNameSnapshot;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    /** Free gift added by an admin (price 0, but stock is still decremented). */
    @Column(name = "gift", nullable = false)
    private boolean gift = false;

    /** Gift the shop added by itself for the order sum (V57, GiftService); always with {@code gift}. */
    @Column(name = "auto_gift", nullable = false)
    private boolean autoGift = false;

    /** Rarity of the gift-case prize (V57, GiftCaseItem.Rarity name); null = not from a case. */
    @Column(name = "case_rarity", length = 16)
    private String caseRarity;

    /**
     * Usual price of one unit of a gift when it went into the order (V64): the line itself costs 0,
     * the gift registry and the monthly per-person limit count it at this price. 0 for a sold line.
     */
    @Column(name = "gift_value_minor", nullable = false)
    private long giftValueMinor = 0;

    /** A case prize with sizes whose size the customer has not chosen yet (V59): the reserved one is a guess. */
    @Column(name = "variant_pending", nullable = false)
    private boolean variantPending = false;

    /** Units of this line the customer sent back (partial or full return). */
    @Column(name = "returned_qty", nullable = false)
    private int returnedQty = 0;

    /**
     * Units of this line already put back on the shelf (by a return or a rejection). Restoring
     * stock only ever adds {@code quantity - restockedQty}, so no unit can be restocked twice.
     */
    @Column(name = "restocked_qty", nullable = false)
    private int restockedQty = 0;

    /**
     * Units on their way back to the shop (V68): a refused parcel or the returned part of a delivered
     * order. Not on the shelf yet — «Посылка вернулась» restocks them or writes them off.
     */
    @Column(name = "return_pending_qty", nullable = false)
    private int returnPendingQty = 0;

    /**
     * The stock lots these units came from (V74, FIFO cost of goods). Kept by {@code costing.LotLedger}:
     * units put back on the shelf leave the list, units returned without restock stay (their cost is a loss).
     */
    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id ASC")
    private List<OrderItemLot> lots = new ArrayList<>();
}
