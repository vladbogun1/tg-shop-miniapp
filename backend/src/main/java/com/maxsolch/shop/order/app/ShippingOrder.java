package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RecipientName;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.lang.Nullable;

import java.time.Instant;
import java.util.List;

/**
 * One order as the Nova Poshta side needs it to make, check and track a waybill (read by {@link ShipmentOrders}).
 *
 * @param shortId           first 8 characters of the id (#a1b2c3d4)
 * @param serviceType       WAREHOUSE for NP orders placed before V98; meaningless for a pickup
 * @param recipientLastName stored parts, or split from {@code customerName} («Прізвище Імʼя») on old orders
 * @param codMinor          what Nova Poshta must collect («Контроль оплати»): the rest to pay, top-ups included;
 *                          the whole collectable sum for «оплата при отриманні»
 * @param amountDueMinor    still to be paid online ({@link OrderMoney#amountDueMinor}); 0 for «при отриманні»
 * @param onlinePaymentMissing the online part of an online order has not arrived
 *                          ({@link OrderMoney#onlinePaymentMissing} — the same rule blocks «Отправлен»)
 * @param goodsKey          fingerprint of the composition (product:variant:units, sorted) — changes with the goods
 * @param returnStatus      the refused parcel is on its way back ({@code IN_TRANSIT}) / was accepted ({@code RECEIVED});
 *                          null = no return
 */
public record ShippingOrder(
        byte[] id,
        String shortId,
        OrderStatus status,
        DeliveryMethod deliveryMethod,
        NpServiceType serviceType,
        @Nullable String cityRef,
        @Nullable String cityName,
        @Nullable String warehouseRef,
        @Nullable String warehouseName,
        @Nullable String streetRef,
        @Nullable String streetName,
        @Nullable String building,
        @Nullable String flat,
        String customerName,
        @Nullable String recipientLastName,
        @Nullable String recipientFirstName,
        @Nullable String recipientMiddleName,
        String phone,
        boolean paymentOnDelivery,
        long totalMinor,
        long codMinor,
        boolean paid,
        long amountDueMinor,
        boolean onlinePaymentMissing,
        boolean archived,
        boolean cancelRequestPending,
        @Nullable String trackingNumber,
        @Nullable Instant approvedAt,
        @Nullable Long tgUserId,
        List<Line> lines,
        String goodsKey,
        @Nullable String returnStatus) {

    /**
     * One line of the order.
     *
     * @param quantity       units in the order (returned units are counted in {@code returnedQty})
     * @param unitPriceMinor price per unit at the order (before the order discount)
     */
    public record Line(String productId, @Nullable String variantId, String title, @Nullable String variantName,
                       int quantity, int returnedQty, long unitPriceMinor, boolean gift) {
    }

    public boolean novaPoshta() {
        return deliveryMethod == DeliveryMethod.NOVA_POSHTA;
    }

    static ShippingOrder of(Order o) {
        String id = UuidUtil.toString(o.getId());
        RecipientName name = o.recipientName();
        String[] split = splitName(o.getCustomerName());
        List<Line> lines = o.getItems().stream().map(ShippingOrder::line).toList();
        return new ShippingOrder(o.getId(), id.length() < 8 ? id : id.substring(0, 8), o.getStatus(),
                o.getDeliveryMethod(), o.npService(), o.getNpCityRef(), o.getNpCityName(), o.getNpWarehouseRef(),
                o.getNpWarehouseName(), o.getNpStreetRef(), o.getNpStreetName(), o.getNpBuilding(), o.getNpFlat(),
                o.getCustomerName(),
                name != null ? name.lastName() : split[0],
                name != null ? name.firstName() : split[1],
                name != null ? name.middleName() : null,
                o.getPhone(), o.isPaymentOnDelivery(), o.getTotalMinor(), OrderMoney.codMinor(o), o.isPaid(),
                OrderMoney.amountDueMinor(o), OrderMoney.onlinePaymentMissing(o),
                o.getArchivedAt() != null, o.isCancelRequestPending(), o.getTrackingNumber(), o.getApprovedAt(), o.getTgUserId(), lines,
                goodsKey(lines), o.getReturnStatus());
    }

    private static Line line(OrderItem i) {
        return new Line(UuidUtil.toString(i.getProductId()),
                i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId()),
                i.getTitleSnapshot(), i.getVariantNameSnapshot(), i.getQuantity(), i.getReturnedQty(),
                i.getPriceMinorSnapshot(), i.isGift());
    }

    /** «Прізвище Імʼя по батькові» → [surname, the rest]; one word = [it, it]. */
    static String[] splitName(String full) {
        String s = full == null ? "" : full.trim().replaceAll("\\s+", " ");
        int sp = s.indexOf(' ');
        return sp < 0 ? new String[] {s, s} : new String[] {s.substring(0, sp), s.substring(sp + 1)};
    }

    private static String goodsKey(List<Line> lines) {
        return lines.stream()
                .map(l -> l.productId() + ":" + (l.variantId() == null ? "" : l.variantId()) + ":"
                        + (l.quantity() - l.returnedQty()))
                .sorted().reduce((a, b) -> a + "," + b).orElse("");
    }
}
