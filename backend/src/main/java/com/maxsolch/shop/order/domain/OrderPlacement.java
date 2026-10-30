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

    /** Where the parcel goes: the method and (for Nova Poshta) the branch. */
    public void deliverTo(DeliveryTarget target) {
        deliveryMethod = target.method();
        npCityRef = target.npCityRef();
        npCityName = target.npCityName();
        npWarehouseRef = target.npWarehouseRef();
        npWarehouseName = target.npWarehouseName();
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

    /** The recipient and the address of {@code other} (a merged order): name, phone, method, branch. */
    public void takeRecipientOf(Order other) {
        customerName = other.customerName;
        phone = other.phone;
        deliverTo(new DeliveryTarget(other.deliveryMethod, other.npCityRef, other.npCityName,
                other.npWarehouseRef, other.npWarehouseName));
    }

    /** This order replaces goods of {@code original} (an exchange): the same customer. */
    public void replaces(Order original) {
        exchangeOfOrderId = original.id;
        userId = original.userId;
    }
}
