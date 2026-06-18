package com.maxsolch.shop.tg;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.OrderStatus;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.util.ArrayList;
import java.util.List;

/**
 * Best-effort Telegram notifications. Every method swallows failures (try/catch + log) so the
 * order/chat transaction never fails because of a bot/network hiccup.
 */
@Slf4j
@Service
public class NotificationService {

    private final ShopBot bot;
    private final AppProperties props;

    public NotificationService(@Lazy ShopBot bot, AppProperties props) {
        this.bot = bot;
        this.props = props;
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    /** Forum topic (message_thread_id) for an order status, or 0 if unset. */
    private int topicForStatus(OrderStatus status) {
        AppProperties.Telegram t = props.getTelegram();
        if (status == null) {
            return t.getNotifyTopicNew();
        }
        return switch (status) {
            case NEW -> t.getNotifyTopicNew();
            case APPROVED -> t.getNotifyTopicProcessing();
            case SHIPPED -> t.getNotifyTopicShipped();
            case DELIVERED -> t.getNotifyTopicClosed();
            case REJECTED -> t.getNotifyTopicRejected();
        };
    }

    /** Post a fresh order card into the topic for its current status; store chat/thread/message ids. */
    private void postCard(Order order) {
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank()) {
            return;
        }
        SendMessage msg = SendMessage.builder()
                .chatId(chatId)
                .text(buildCard(order))
                .parseMode("HTML")
                .replyMarkup(adminButtons(order))
                .build();
        int topic = topicForStatus(order.getStatus());
        if (topic > 0) {
            msg.setMessageThreadId(topic);
        }
        try {
            Message sent = bot.execute(msg);
            if (sent != null && sent.getChatId() != null) {
                order.setNotifyChatId(sent.getChatId());
            }
            order.setNotifyThreadId(topic > 0 ? topic : null);
            if (sent != null) {
                order.setNotifyMessageId(sent.getMessageId());
            }
        } catch (Exception e) {
            log.warn("postCard failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Delete a previously posted card (best-effort). */
    private void deleteCard(Order order) {
        Long chatId = order.getNotifyChatId();
        Integer messageId = order.getNotifyMessageId();
        if (chatId == null || messageId == null) {
            return;
        }
        try {
            bot.execute(DeleteMessage.builder()
                    .chatId(String.valueOf(chatId))
                    .messageId(messageId)
                    .build());
        } catch (Exception e) {
            log.debug("deleteCard failed for order {}: {}", idStr(order), e.getMessage());
        }
        order.setNotifyMessageId(null);
    }

    /** New order → post a card into the "New" topic. */
    public void onNewOrder(Order order) {
        if (!enabled()) {
            return;
        }
        postCard(order);
    }

    /** Status changed → MOVE the card: delete from the old topic and re-post into the new one. */
    public void onStatusChanged(Order order) {
        if (!enabled()) {
            return;
        }
        try {
            deleteCard(order);
            postCard(order);
        } catch (Exception e) {
            log.warn("onStatusChanged notification failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** DM the customer about a status change (only if tg_user_id is present and > 0). */
    public void notifyCustomerStatus(Order order) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            String text = statusHeader(order) + "\n"
                    + "Заказ <b>#" + shortId(order) + "</b>\n"
                    + statusCustomerNote(order);
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order))
                    .build();
            bot.execute(msg);
        } catch (Exception e) {
            log.warn("notifyCustomerStatus failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Admin posted a chat message → DM the customer with a deep-link to the order chat. */
    public void onAdminChatMessage(Order order, String preview) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            StringBuilder t = new StringBuilder();
            t.append("💬 <b>Новое сообщение по заказу #").append(shortId(order)).append("</b>\n");
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(esc(trim(preview, 160))).append("</blockquote>\n");
            }
            t.append("Нажмите, чтобы открыть переписку 👇");
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order))
                    .build();
            bot.execute(msg);
        } catch (Exception e) {
            log.warn("onAdminChatMessage failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Customer posted a chat message → notify admins in the "chat messages" topic with an open button. */
    public void onCustomerChatMessage(Order order, String preview) {
        if (!enabled()) {
            return;
        }
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank()) {
            return;
        }
        try {
            StringBuilder t = new StringBuilder();
            t.append("💬 <b>Новое сообщение от клиента</b>\n");
            t.append("Заказ <b>#").append(shortId(order)).append("</b> · ")
                    .append(esc(nz(order.getCustomerName()))).append('\n');
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(esc(trim(preview, 200))).append("</blockquote>");
            }
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(adminButtons(order))
                    .build();
            int topic = props.getTelegram().getNotifyTopicChat();
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            bot.execute(msg);
        } catch (Exception e) {
            log.warn("onCustomerChatMessage failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    // ----- helpers -----

    /** Telegram only accepts HTTPS URLs in inline buttons (and rejects localhost). */
    private static boolean isHttps(String url) {
        return url != null && url.startsWith("https://");
    }

    private InlineKeyboardMarkup adminButtons(Order order) {
        String adminBase = props.getAdminBaseUrl();
        // Skip buttons until a public HTTPS admin URL is configured (local http://localhost is
        // rejected by Telegram and would fail the whole message send).
        if (!isHttps(adminBase)) {
            return null;
        }
        InlineKeyboardButton open = InlineKeyboardButton.builder()
                .text("🔎 Открыть в админке")
                .url(adminBase + "/orders/" + idStr(order))
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(open))).build();
    }

    private InlineKeyboardMarkup chatButton(Order order) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text("Открыть переписку")
                .webApp(WebAppInfo.builder().url(webapp + "?startapp=order_" + idStr(order)).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    /** Nicely formatted HTML order card (Telegram parse_mode=HTML). */
    private String buildCard(Order order) {
        String cur = nz(order.getCurrency());
        StringBuilder sb = new StringBuilder();
        sb.append(statusHeader(order)).append('\n');
        sb.append("<b>🧾 Заказ #").append(shortId(order)).append("</b>\n");
        sb.append("➖➖➖➖➖➖➖➖➖➖\n");
        // customer
        sb.append("👤 ").append(esc(nz(order.getCustomerName()))).append('\n');
        sb.append("📞 ").append(esc(nz(order.getPhone()))).append('\n');
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
            sb.append("✈️ @").append(esc(order.getTgUsername().replace("@", ""))).append('\n');
        }
        // items
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            sb.append("\n<b>🛒 Состав</b>\n");
            for (OrderItem it : order.getItems()) {
                sb.append("• ").append(esc(it.getTitleSnapshot()));
                if (it.getVariantNameSnapshot() != null) {
                    sb.append(" <i>(").append(esc(it.getVariantNameSnapshot())).append(")</i>");
                }
                long line = it.getPriceMinorSnapshot() * (long) it.getQuantity();
                sb.append(" × ").append(it.getQuantity())
                        .append(" — ").append(money(line)).append(' ').append(cur).append('\n');
            }
        }
        // totals
        sb.append("\n💰 <b>Итого: ").append(money(order.getTotalMinor())).append(' ').append(cur).append("</b>");
        if (order.getDiscountMinor() > 0) {
            sb.append(" <i>(скидка ").append(money(order.getDiscountMinor())).append(' ').append(cur).append(")</i>");
        }
        sb.append('\n');
        if (order.getPaymentOptionTitle() != null) {
            sb.append("💳 ").append(esc(order.getPaymentOptionTitle())).append('\n');
        }
        sb.append("🚚 ").append(deliveryLabel(order)).append('\n');
        if (order.getComment() != null && !order.getComment().isBlank()) {
            sb.append("📝 ").append(esc(order.getComment())).append('\n');
        }
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("📦 ТТН: <code>").append(esc(order.getTrackingNumber())).append("</code>\n");
        }
        if (order.getRejectReason() != null && !order.getRejectReason().isBlank()) {
            sb.append("\n❌ <b>Причина отклонения:</b> ").append(esc(order.getRejectReason())).append('\n');
        }
        return sb.toString();
    }

    private String statusHeader(Order order) {
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

    /** Short customer-facing note per status (for the status DM). */
    private String statusCustomerNote(Order order) {
        OrderStatus s = order.getStatus();
        if (s == null) {
            return "";
        }
        return switch (s) {
            case APPROVED -> "Мы подтвердили ваш заказ и готовим его к отправке.";
            case SHIPPED -> order.getTrackingNumber() != null
                    ? "Заказ отправлен. ТТН: <code>" + esc(order.getTrackingNumber()) + "</code>"
                    : "Заказ отправлен.";
            case DELIVERED -> "Заказ доставлен. Спасибо за покупку! 🙌";
            case REJECTED -> order.getRejectReason() != null
                    ? "К сожалению, заказ отклонён. Причина: " + esc(order.getRejectReason())
                    : "К сожалению, заказ отклонён.";
            default -> "";
        };
    }

    private String deliveryLabel(Order order) {
        if (order.getDeliveryMethod() == DeliveryMethod.PICKUP) {
            return "Самовывоз";
        }
        StringBuilder d = new StringBuilder("Новая Почта");
        if (order.getNpCityName() != null) {
            d.append(" — ").append(esc(order.getNpCityName()));
            if (order.getNpWarehouseName() != null) {
                d.append(", ").append(esc(order.getNpWarehouseName()));
            }
        }
        return d.toString();
    }

    private String money(long minor) {
        long whole = minor / 100;
        return String.format("%,d", whole).replace(',', ' ');
    }

    private String esc(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String nz(String s) {
        return s == null ? "" : s;
    }

    private String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    private String idStr(Order order) {
        return UuidUtil.toString(order.getId());
    }

    private String shortId(Order order) {
        String id = idStr(order);
        return id == null ? "?" : id.substring(0, 8);
    }
}
