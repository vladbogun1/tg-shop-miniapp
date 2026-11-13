package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.notification.app.SellerChannel;
import com.maxsolch.shop.notification.domain.SellerTopic;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * One line to the sellers' group about a linked waybill (best-effort, never throws): a return waits in the branch
 * (paid storage from …), a return was picked up, a redirected parcel was picked up, the customer sent a return after
 * pickup. Nothing goes to the customer.
 */
@Component
public class LinkedParcelNotifier {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM");

    private final SellerChannel seller;
    private final ShipmentOrders orders;

    LinkedParcelNotifier(SellerChannel seller, ShipmentOrders orders) {
        this.seller = seller;
        this.orders = orders;
    }

    /** A redirected parcel waiting for the customer is the customer's business; everything else that arrives is ours. */
    static boolean worthTelling(ParcelLink.Kind kind, ShipmentStage reached) {
        return reached == ShipmentStage.RECEIVED || (reached == ShipmentStage.ARRIVED && kind.toUs());
    }

    /** The text for a stage reached; null = nothing to say. */
    static String text(ParcelLink l, ShipmentStage reached) {
        String order = "заказ <b>#" + shortId(l.getOrderId()) + "</b> · ТТН " + l.getTtn();
        ParcelLink.Kind kind = l.kindEnum();
        if (!worthTelling(kind, reached)) {
            return null;
        }
        if (!kind.toUs()) {
            return "📬 <b>Переадресованную посылку забрали</b>\n" + order + "\nЗакройте заказ, если всё в порядке.";
        }
        String accept = kind == ParcelLink.Kind.LIGHT_RETURN ? "оформите в заказе «Возврат»"
                : "примите в заказе: «Едет назад» → «Посылка вернулась»";
        if (reached == ShipmentStage.ARRIVED) {
            LocalDate paid = l.getStoragePaidFrom();
            return "📦 <b>Возврат ждёт в отделении</b>\n" + order
                    + (paid == null ? "" : "\nПлатное хранение с " + paid.format(DAY))
                    + "\nЗаберите и " + accept + ".";
        }
        return "✅ <b>Возврат забрали</b>\n" + order + "\nТеперь " + accept + ".";
    }

    void stageReached(ParcelLink l) {
        String text = text(l, l.stageEnum());
        if (text != null && stillNeeded(l)) {
            post("NP_LINK_" + l.getStage(), l.getOrderId(), text);
        }
    }

    void lightReturnSent(ParcelLink l) {
        if (!stillNeeded(l)) {
            return;
        }
        byte[] orderId = l.getOrderId();
        String ttn = l.getTtn();
        post("NP_LIGHT_RETURN", orderId, "↩️ <b>Покупатель отправил возврат</b>\nзаказ <b>#" + shortId(orderId)
                + "</b> · ТТН " + ttn + "\nКогда придёт — оформите «Возврат» в заказе.");
    }

    /**
     * Only what the order still waits for — the rule of «Внимание» ({@link LinkedParcelIssues#reason}): a return the
     * order already accepted, a closed or archived order stay quiet (the first poll finds old returns too).
     */
    private boolean stillNeeded(ParcelLink l) {
        try {
            return orders.find(l.getOrderId()).filter(o -> !o.archived())
                    .map(o -> LinkedParcelIssues.reason(l, o) != null).orElse(false);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void post(String type, byte[] orderId, String text) {
        String id = UuidUtil.toString(orderId);
        seller.post("Linked parcel note failed for order " + id,
                ActivityLog.Entry.bot(type).order(orderId).text(text), text, "/orders/" + id, SellerTopic.SHIPPED);
    }

    static String shortId(byte[] orderId) {
        String id = UuidUtil.toString(orderId);
        return id.length() < 8 ? id : id.substring(0, 8);
    }
}
