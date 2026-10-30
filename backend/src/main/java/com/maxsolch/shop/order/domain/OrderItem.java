package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.inventory.domain.LotAllocations;
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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Getter
@Entity
@Table(name = "order_items")
public class OrderItem implements LotAllocations {

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

    // ---- creating a line: through these factories, the snapshot of the product is taken once

    /** A sold line: the price of the unit at the moment of the order. */
    public static OrderItem sold(Order order, byte[] productId, String title, long priceMinor, int quantity) {
        OrderItem i = new OrderItem();
        i.order = order;
        i.productId = productId;
        i.titleSnapshot = title;
        i.priceMinorSnapshot = priceMinor;
        i.quantity = quantity;
        return i;
    }

    /** A free line added by an admin: price 0, the usual price of a unit is kept for the gift registry. */
    public static OrderItem gift(Order order, byte[] productId, String title, long valueMinor, int quantity) {
        OrderItem i = sold(order, productId, title, 0, quantity);
        i.gift = true;
        i.giftValueMinor = valueMinor;
        return i;
    }

    /** The gift the shop itself added (for the order sum, or the prize of a case): one unit at price 0. */
    public static OrderItem autoGift(Order order, byte[] productId, String title, long valueMinor, String rarity) {
        OrderItem i = gift(order, productId, title, valueMinor, 1);
        i.autoGift = true;
        i.caseRarity = rarity;
        return i;
    }

    /** The same line on another order (a merge): the snapshot, the flags, no stock lots yet. */
    public OrderItem copyTo(Order target) {
        OrderItem i = sold(target, productId, titleSnapshot, priceMinorSnapshot, quantity);
        i.variantId = variantId;
        i.variantNameSnapshot = variantNameSnapshot;
        i.gift = gift;
        i.autoGift = autoGift;
        i.caseRarity = caseRarity;
        i.giftValueMinor = giftValueMinor;
        i.variantPending = variantPending;
        return i;
    }

    // ---- the line

    /** The chosen size / colour. */
    public OrderItem withVariant(byte[] id, String name) {
        variantId = id;
        variantNameSnapshot = name;
        return this;
    }

    /** A case prize with sizes: the fullest one is held until the customer picks theirs. */
    public OrderItem pendingVariant(boolean pending) {
        variantPending = pending;
        return this;
    }

    public void changeQuantity(int newQuantity) {
        quantity = newQuantity;
    }

    public void addQuantity(int more) {
        quantity += more;
    }

    /** The customer picked their size: the line moves to it and no longer waits for a choice. */
    public void chooseVariant(byte[] id, String name) {
        variantId = id;
        variantNameSnapshot = name;
        variantPending = false;
    }

    public void confirmVariant() {
        variantPending = false;
    }

    // ---- returns and the shelf

    /** Units put back on the shelf: never more than the line has. */
    public void markRestocked(int units) {
        restockedQty = Math.min(quantity, restockedQty + units);
    }

    /** Units taken off the shelf again (a cancelled return): never below 0. */
    public void unmarkRestocked(int units) {
        restockedQty = Math.max(0, restockedQty - units);
    }

    /** Units the customer sent back (a return). */
    public void registerReturned(int units) {
        returnedQty += units;
    }

    /** A cancelled return: the units are in the order again. */
    public void unregisterReturned(int units) {
        returnedQty = Math.max(0, returnedQty - units);
    }

    /** Units sent back that are on their way to the shop. */
    public void registerSentBack(int units) {
        returnedQty += units;
        returnPendingQty += units;
    }

    /** A refused parcel is on its way back: every unit not restocked yet waits for it. */
    public void awaitReturn() {
        returnPendingQty = Math.max(0, quantity - restockedQty);
    }

    /** Units of the way back that a cancelled return takes away from the waiting ones. */
    public void reduceReturnPending(int units) {
        returnPendingQty = Math.max(0, returnPendingQty - units);
    }

    /** The parcel arrived: nothing is on its way any more. */
    public void clearReturnPending() {
        returnPendingQty = 0;
    }

    /** The stock lots of {@code from} (a merged line) move here with the units, never counted twice. */
    public void takeLotsOf(OrderItem from) {
        if (from.lots == null || from.lots.isEmpty()) {
            return;
        }
        if (lots == null) {
            lots = new ArrayList<>();
        }
        for (OrderItemLot a : from.lots) {
            lots.add(OrderItemLot.of(this, a.getLotId(), a.getQty(), a.getCreatedAt()));
        }
        from.lots.clear();
    }

    // ---- LotAllocations: inventory records on the line which stock lots its units came from

    @Override
    public List<Share> shares() {
        return lots == null ? List.of() : lots.stream().map(a -> new Share(a.getLotId(), a.getQty())).toList();
    }

    @Override
    public void add(long lotId, int qty, Instant at) {
        if (lots == null) {
            lots = new ArrayList<>();
        }
        OrderItemLot last = lots.isEmpty() ? null : lots.get(lots.size() - 1);
        if (last != null && last.getLotId() == lotId) {
            last.changeQty(last.getQty() + qty);
            return;
        }
        lots.add(OrderItemLot.of(this, lotId, qty, at));
    }

    @Override
    public void reduceAt(int index, int qty) {
        OrderItemLot a = lots.get(index);
        a.changeQty(a.getQty() - qty);
        if (a.getQty() == 0) {
            lots.remove(index);
        }
    }
}
