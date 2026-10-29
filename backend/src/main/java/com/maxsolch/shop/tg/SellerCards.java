package com.maxsolch.shop.tg;

import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderMoney;
import com.maxsolch.shop.domain.OrderSource;
import com.maxsolch.shop.domain.OrderStatus;

import static com.maxsolch.shop.platform.util.Texts.escHtml;
import static com.maxsolch.shop.tg.TgFormat.money;
import static com.maxsolch.shop.tg.TgFormat.nz;
import static com.maxsolch.shop.tg.TgFormat.shortId;

/**
 * What the seller's cards say (Telegram parse_mode=HTML): the order card of the status topics and the
 * «К ОТПРАВКЕ» card. Pure text from an {@link Order}; where and when they are posted is
 * {@link SellerChannel}'s business. The seller reads Russian, so these are not in the bundle.
 */
final class SellerCards {

    private SellerCards() {
    }

    /** Seller-facing dispatch card: address, items, and the exact COD (наложка) to set. */
    static String buildDispatchCard(Order order) {
        String cur = nz(order.getCurrency());
        long received = OrderMoney.receivedMinor(order);
        long cod = OrderMoney.codMinor(order);
        StringBuilder sb = new StringBuilder();
        sb.append("📦 <b>К ОТПРАВКЕ</b> · #").append(shortId(order)).append('\n');
        sb.append("➖➖➖➖➖➖➖➖➖➖\n");
        sb.append("👤 ").append(escHtml(nz(order.getCustomerName()))).append('\n');
        sb.append("📞 ").append(escHtml(nz(order.getPhone()))).append('\n');
        sb.append("🚚 ").append(deliveryLabel(order)).append('\n');
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            sb.append("\n<b>🛒 Отправить:</b>\n");
            for (OrderItem it : order.getItems()) {
                sb.append(it.isGift() ? "• 🎁 " : "• ").append(escHtml(it.getTitleSnapshot()));
                if (it.getVariantNameSnapshot() != null) {
                    sb.append(" <i>(").append(escHtml(it.getVariantNameSnapshot())).append(")</i>");
                }
                sb.append(" × ").append(it.getQuantity());
                if (it.isGift()) {
                    sb.append(" <i>(подарок)</i>");
                }
                sb.append('\n');
            }
        }
        sb.append("\n💰 Сумма заказа: <b>").append(money(order.getTotalMinor())).append(' ').append(cur).append("</b>\n");
        if (order.getPaymentOptionTitle() != null) {
            sb.append("💳 ").append(escHtml(order.getPaymentOptionTitle())).append('\n');
        }
        if (received > 0) {
            sb.append("✅ Уже оплачено: ").append(money(received)).append(' ').append(cur).append('\n');
        }
        if (cod <= 0) {
            sb.append("\n🟢 <b>НАЛОЖКА: 0</b> — заказ оплачен, отправляем без наложенного платежа.");
        } else if (received > 0) {
            sb.append("\n🟡 <b>НАЛОЖКА (взять при выдаче): ").append(money(cod)).append(' ').append(cur).append("</b>\n")
                    .append("<i>(сумма ").append(money(order.getTotalMinor()))
                    .append(" − предоплата ").append(money(received)).append(")</i>");
        } else {
            sb.append("\n🔴 <b>НАЛОЖКА (взять при выдаче): ").append(money(cod)).append(' ').append(cur)
                    .append("</b> — не оплачено.");
        }
        return sb.toString();
    }


    /** Nicely formatted HTML order card (Telegram parse_mode=HTML). */
    static String buildCard(Order order) {
        String cur = nz(order.getCurrency());
        StringBuilder sb = new StringBuilder();
        sb.append(statusHeader(order)).append('\n');
        sb.append("<b>🧾 Заказ #").append(shortId(order)).append("</b>\n");
        if (order.getSource() == OrderSource.WEB) {
            sb.append("🌐 Сайт\n");
        }
        sb.append("➖➖➖➖➖➖➖➖➖➖\n");
        // customer
        sb.append("👤 ").append(escHtml(nz(order.getCustomerName()))).append('\n');
        sb.append("📞 ").append(escHtml(nz(order.getPhone()))).append('\n');
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
            sb.append("✈️ @").append(escHtml(order.getTgUsername().replace("@", ""))).append('\n');
        }
        // items
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            sb.append("\n<b>🛒 Состав</b>\n");
            for (OrderItem it : order.getItems()) {
                sb.append("• ").append(escHtml(it.getTitleSnapshot()));
                if (it.getVariantNameSnapshot() != null) {
                    sb.append(" <i>(").append(escHtml(it.getVariantNameSnapshot())).append(")</i>");
                }
                long line = it.getPriceMinorSnapshot() * (long) it.getQuantity();
                sb.append(" × ").append(it.getQuantity())
                        .append(" — ").append(money(line)).append(' ').append(cur);
                if (it.isAutoGift() && it.getCaseRarity() != null) {
                    sb.append(" 🎁 <i>из кейса (").append(it.getCaseRarity()).append(")</i>");
                } else if (it.isAutoGift()) {
                    sb.append(" 🎁 <i>подарок за сумму</i>");
                }
                sb.append('\n');
            }
        }
        // totals
        sb.append("\n💰 <b>Итого: ").append(money(order.getTotalMinor())).append(' ').append(cur).append("</b>");
        if (order.getDiscountMinor() > 0) {
            sb.append(" <i>(скидка ").append(money(order.getDiscountMinor())).append(' ').append(cur).append(")</i>");
        }
        sb.append('\n');
        if (order.getPaymentOptionTitle() != null) {
            sb.append("💳 ").append(escHtml(order.getPaymentOptionTitle())).append('\n');
        }
        sb.append("🚚 ").append(deliveryLabel(order)).append('\n');
        if (order.getComment() != null && !order.getComment().isBlank()) {
            sb.append("📝 ").append(escHtml(order.getComment())).append('\n');
        }
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("📦 ТТН: <code>").append(escHtml(order.getTrackingNumber())).append("</code>\n");
        }
        if (order.getRejectReason() != null && !order.getRejectReason().isBlank()) {
            sb.append("\n❌ <b>Причина отклонения:</b> ").append(escHtml(order.getRejectReason())).append('\n');
        }
        return sb.toString();
    }


    /** Name of the seller's forum topic a card of this status goes to (for the journal). */
    static String statusTopicName(OrderStatus status) {
        if (status == null) {
            return "Новые";
        }
        return switch (status) {
            case NEW -> "Новые";
            case APPROVED -> "В работе";
            case SHIPPED -> "Высланы";
            case DELIVERED -> "Закрытые";
            case REJECTED -> "Отклонённые";
        };
    }

    static String statusHeader(Order order) {
        OrderStatus s = order.getStatus();
        if (s == null) {
            return "<b>Заказ</b>";
        }
        return switch (s) {
            case NEW -> "🆕 <b>Новый заказ</b>";
            case APPROVED -> "✅ <b>Одобрен</b>";
            case SHIPPED -> "📦 <b>Выслан</b>";
            case DELIVERED -> "🎉 <b>Доставлен</b>";
            case REJECTED -> "❌ <b>Отклонён</b>";
        };
    }


    static String deliveryLabel(Order order) {
        if (order.getDeliveryMethod() == DeliveryMethod.PICKUP) {
            return "Самовывоз";
        }
        StringBuilder d = new StringBuilder("Новая Почта");
        if (order.getNpCityName() != null) {
            d.append(" — ").append(escHtml(order.getNpCityName()));
            if (order.getNpWarehouseName() != null) {
                d.append(", ").append(escHtml(order.getNpWarehouseName()));
            }
        }
        return d.toString();
    }
}
