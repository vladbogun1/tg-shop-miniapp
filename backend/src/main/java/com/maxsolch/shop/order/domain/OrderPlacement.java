package com.maxsolch.shop.order.domain;

import java.time.Instant;

/**
 * Placing an order and its contact details: who ordered, where the parcel goes, which payment option was chosen,
 * the recipient and comment the admin corrects later. These change no money and no status, so they sit below
 * {@link Order}, which adds the status machine, the lines and the money rules on top. Each method writes the
 * protected columns of {@link OrderColumns}.
 */
public abstract class OrderPlacement extends OrderHousekeeping {

    /** The buyer and the contact of a new order; the source defaults to the Mini App. */
    public void placeBy(OrderBuyer buyer, OrderSource orderSource) {
        currency = "UAH";
        customerName = buyer.customerName();
        phone = buyer.phone();
        comment = buyer.comment();
        userId = buyer.userId();
        tgUserId = buyer.tgUserId();
        tgUsername = buyer.tgUsername();
        source = orderSource == null ? OrderSource.MINIAPP : orderSource;
    }

    /**
     * Where the parcel goes: the method and (for Nova Poshta) the service type with the branch / parcel locker or
     * the courier address. The fields of the other kind are cleared, so a courier order keeps no stale branch.
     */
    public void deliverTo(DeliveryTarget target) {
        deliveryMethod = target.method();
        npCityRef = target.npCityRef();
        npCityName = target.npCityName();
        boolean doors = target.serviceType() == NpServiceType.DOORS;
        npServiceType = target.serviceType() == null ? null : target.serviceType().name();
        npWarehouseRef = doors ? null : target.npWarehouseRef();
        npWarehouseName = doors ? null : target.npWarehouseName();
        npStreetRef = doors ? target.npStreetRef() : null;
        npStreetName = doors ? target.npStreetName() : null;
        npBuilding = doors ? target.npBuilding() : null;
        npFlat = doors ? target.npFlat() : null;
    }

    /** Where the parcel goes now, as one value (the inverse of {@link #deliverTo}). */
    public DeliveryTarget deliveryTarget() {
        return new DeliveryTarget(deliveryMethod, npCityRef, npCityName, npWarehouseRef, npWarehouseName,
                npServiceType == null ? null : NpServiceType.of(npServiceType),
                npStreetRef, npStreetName, npBuilding, npFlat);
    }

    /** How Nova Poshta delivers it; WAREHOUSE for orders placed before V98. */
    public NpServiceType npService() {
        return NpServiceType.of(npServiceType);
    }

    /** The recipient's name as the waybill needs it (surname and name apart); null = not split (old orders). */
    public void nameRecipient(RecipientName name) {
        recipientLastName = name == null ? null : name.lastName();
        recipientFirstName = name == null ? null : name.firstName();
        recipientMiddleName = name == null ? null : name.middleName();
    }

    /** The split recipient name; null when the order was placed with one name field. */
    public RecipientName recipientName() {
        return recipientLastName == null && recipientFirstName == null ? null
                : new RecipientName(recipientLastName, recipientFirstName, recipientMiddleName);
    }

    /**
     * «Оплата при отриманні»: the snapshot of the option, nothing due online (no prepayment, no deadline) — Nova
     * Poshta collects the whole total («Контроль оплати»).
     */
    public void choosePaymentOnDelivery(byte[] optionId, String title) {
        paymentOptionId = optionId;
        paymentOptionTitle = title;
        prepaymentMinor = 0;
        paymentDueAt = null;
        paymentOnDelivery = true;
    }

    /** A new Nova Poshta branch for the same delivery method. */
    public void changeBranch(String cityRef, String cityName, String warehouseRef, String warehouseName) {
        npCityRef = cityRef;
        npCityName = cityName;
        npWarehouseRef = warehouseRef;
        npWarehouseName = warehouseName;
    }

    /** The snapshot of the chosen payment option; the clock to pay ends at {@code dueAt}. */
    public void choosePayment(byte[] optionId, String title, long prepayment, Instant dueAt) {
        paymentOptionId = optionId;
        paymentOptionTitle = title;
        prepaymentMinor = Math.max(0, prepayment);
        paymentDueAt = dueAt;
    }

    /** The online part is not capped by a prepayment snapshot any more (an exchange replacement). */
    public void dropPrepayment() {
        prepaymentMinor = 0;
    }

    /**
     * Where the rest of a paid online order is paid: {@code true} — наложкой on delivery (shipping is not blocked,
     * the customer may still pay online), {@code false} — online before shipping, as the order was placed.
     */
    public void collectBalanceOnDelivery(boolean onDelivery) {
        balanceOnDelivery = onDelivery;
    }

    /** The bot told the customer about this top-up ({@link OrderMoney#topUpNotice}). */
    public void markTopUpNotice(String notice) {
        topupNotice = notice;
    }

    /** No deadline to pay (an admin sale, a fully covered or merged order). */
    public void dropPaymentDeadline() {
        paymentDueAt = null;
    }

    public void rename(String name) {
        customerName = name;
    }

    public void changePhone(String newPhone) {
        phone = newPhone;
    }

    public void changeComment(String newComment) {
        comment = newComment;
    }

    public void changeTrackingNumber(String ttn) {
        trackingNumber = ttn;
    }

    /** The recipient and the address of {@code other} (a merged order): name (and its parts), phone, delivery. */
    public void takeRecipientOf(Order other) {
        customerName = other.customerName;
        phone = other.phone;
        nameRecipient(other.recipientName());
        deliverTo(other.deliveryTarget());
    }

    /** This order replaces goods of {@code original} (an exchange): the same customer. */
    public void replaces(Order original) {
        exchangeOfOrderId = original.id;
        userId = original.userId;
    }
}
