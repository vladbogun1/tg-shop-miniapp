package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;

@Service
@Slf4j
public class TelegramNotifyService {

    public static final String CB_APPROVE_PREFIX = "order:approve:";
    public static final String CB_REJECT_PREFIX  = "order:reject:";
    public static final String CB_SHIP_PREFIX = "order:ship:";

    private final TelegramSender sender;
    private final AppProperties props;
    private final SettingRepository settingRepository;

    public TelegramNotifyService(
            TelegramSender sender,
            AppProperties props,
            SettingRepository settingRepository
    ) {
        this.sender = sender;
        this.props = props;
        this.settingRepository = settingRepository;
    }

    /** Админу: новый заказ + кнопки approve/reject */
    public void notifyNewOrder(OrderEntity order) {
        String chatId = getAdminChatId();
        if (chatId == null || chatId.isBlank()) {
            log.warn("🤖 TG Skipping admin notification: admin chat id not configured");
            return;
        }

        String text = buildAdminOrderText(order);

        var approveBtn = InlineKeyboardButton.builder()
                .text("✅ Одобрить")
                .callbackData(CB_APPROVE_PREFIX + order.uuid().toString())
                .build();

        var rejectBtn = InlineKeyboardButton.builder()
                .text("❌ Отклонить")
                .callbackData(CB_REJECT_PREFIX + order.uuid().toString())
                .build();

        var kb = InlineKeyboardMarkup.builder()
                .keyboard(List.of(List.of(approveBtn, rejectBtn)))
                .build();

        SendMessage msg = SendMessage.builder()
                .chatId(chatId)
                .parseMode(ParseMode.HTML)
                .text(text)
                .replyMarkup(kb)
                .build();

        log.info("🤖 TG Sending admin notification for order uuid={} chatId={}", order.uuid(), chatId);
        sender.safeExecute(msg);
    }

    /** Пользователю: сразу после оформления */
    public void notifyUserOrderPlaced(OrderEntity order) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("✅ <b>Заказ принят</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        sb.append("💰 Итого: ")
                .append(order.getTotalMinor()).append(" ").append(escapeHtml(order.getCurrency()))
                .append("\n\n");
        sb.append("Мы свяжемся с вами после проверки заказа администратором.");

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(sb.toString())
                .build();

        log.info("🤖 TG Sending user order placed notification uuid={} tgUserId={}", order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }

    /** Пользователю: когда админ одобрил/отклонил */
    public void notifyUserOrderStatus(OrderEntity order, OrderDecision decision) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user status notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        String text;
        if (decision == OrderDecision.APPROVED) {
            StringBuilder sb = new StringBuilder();
            sb.append("✅ <b>Ваш заказ одобрен</b>\n");
            sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
            sb.append(buildItemsBlock(order));
            sb.append("\nСпасибо! Мы скоро свяжемся с вами.");
            text = sb.toString();
        } else {
            text = "❌ <b>Ваш заказ отклонён</b>\n" +
                "ID: <code>" + escapeHtml(order.uuid().toString()) + "</code>\n" +
                "Если хотите — оформите заказ повторно или уточните детали у администратора.";
        }

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(text)
                .build();

        log.info("🤖 TG Sending user order status notification uuid={} decision={} tgUserId={}",
                order.uuid(), decision, order.getTgUserId());
        sender.safeExecute(msg);
    }

    /** Пользователю: когда админ отклонил с причиной */
    public void notifyUserOrderRejected(OrderEntity order, String reason) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user rejected notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("❌ <b>Ваш заказ отклонён</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        if (reason != null && !reason.isBlank()) {
            sb.append("Причина: ").append(escapeHtml(reason)).append("\n");
        }
        sb.append("Если хотите — оформите заказ повторно или уточните детали у администратора.");

        SendMessage msg = SendMessage.builder()
            .chatId(String.valueOf(order.getTgUserId()))
            .parseMode(ParseMode.HTML)
            .text(sb.toString())
            .build();

        log.info("🤖 TG Sending user rejected notification uuid={} tgUserId={}", order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }
    /** Пользователю: когда заказ отправлен */
    public void notifyUserOrderShipped(OrderEntity order) {
        if (order.getTgUserId() <= 0) {
            log.warn("🤖 TG Skipping user shipped notification: missing tg user id for order uuid={}", order.uuid());
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("📦 <b>Ваш заказ отправлен</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n");
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("ТТН: ").append(escapeHtml(order.getTrackingNumber())).append("\n");
        }
        sb.append(buildItemsBlock(order));
        sb.append("\nСпасибо за заказ!");

        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(order.getTgUserId()))
                .parseMode(ParseMode.HTML)
                .text(sb.toString())
                .build();

        log.info("🤖 TG Sending user order shipped notification uuid={} tgUserId={}",
                order.uuid(), order.getTgUserId());
        sender.safeExecute(msg);
    }

    private String buildAdminOrderText(OrderEntity order) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b>🛒 Новый заказ</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n\n");
        sb.append("👤 ").append(escapeHtml(order.getCustomerName())).append("\n");
        sb.append("📞 ").append(escapeHtml(order.getPhone())).append("\n");
        sb.append("📦 ").append(escapeHtml(order.getAddress())).append("\n");
        if (order.getComment() != null && !order.getComment().isBlank()) {
            sb.append("💬 ").append(escapeHtml(order.getComment())).append("\n");
        }

        sb.append("\n<b>🧾 Состав:</b>\n");
        order.getItems().forEach(i -> {
            long lineTotal = i.getPriceMinorSnapshot() * (long) i.getQuantity();
            sb.append("• ")
                    .append(escapeHtml(i.getTitleSnapshot()))
                    .append(" × ")
                    .append(i.getQuantity())
                    .append(" — ")
                    .append(lineTotal)
                    .append(" ")
                    .append(escapeHtml(order.getCurrency()))
                    .append("\n");
        });

        sb.append("\n<b>💰 Итого:</b> ")
                .append(order.getTotalMinor())
                .append(" ")
                .append(escapeHtml(order.getCurrency()))
                .append("\n");

        sb.append("\n👤 TG: ").append(escapeHtml(String.valueOf(order.getTgUserId())));
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
            sb.append(" (@").append(escapeHtml(order.getTgUsername())).append(")");
        }
        sb.append("\n");

        return sb.toString();
    }

    private String buildItemsBlock(OrderEntity order) {
        StringBuilder sb = new StringBuilder();
        sb.append("\n<b>🧾 Состав:</b>\n");
        order.getItems().forEach(i -> {
            long lineTotal = i.getPriceMinorSnapshot() * (long) i.getQuantity();
            sb.append("• ")
                .append(escapeHtml(i.getTitleSnapshot()))
                .append(" × ")
                .append(i.getQuantity())
                .append(" — ")
                .append(lineTotal)
                .append(" ")
                .append(escapeHtml(order.getCurrency()))
                .append("\n");
        });
        sb.append("\n<b>💰 Итого:</b> ")
            .append(order.getTotalMinor())
            .append(" ")
            .append(escapeHtml(order.getCurrency()))
            .append("\n");
        return sb.toString();
    }

    private String getAdminChatId() {
        Optional<Setting> s = settingRepository.findById("ADMIN_CHAT_ID");
        if (s.isPresent()) {
            return s.get().getValue();
        }
        return props.getTelegram().getDefaultAdminChatId();
    }

    public enum OrderDecision { APPROVED, REJECTED }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
