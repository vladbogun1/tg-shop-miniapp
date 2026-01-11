package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderService; // <-- добавь свой сервис
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.ForceReplyKeyboard;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

@Component
@Slf4j
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final SettingRepository settings;
    private final OrderService orderService;
    private final Map<Integer, PendingShipment> pendingShipments = new ConcurrentHashMap<>();

    public ShopBot(
        AppProperties props,
        SettingRepository settings,
        @Lazy TelegramNotifyService notifyService,
        OrderService orderService
    ) {
        super(props.getTelegram().getBotToken());
        this.props = props;
        this.settings = settings;
        this.orderService = orderService;
    }

    @Override
    public String getBotUsername() {
        return props.getTelegram().getBotUsername();
    }

    @Override
    public void onUpdateReceived(Update update) {
        if (update == null) return;

        // 1) inline callbacks (approve/reject)
        if (update.hasCallbackQuery()) {
            log.info("🤖 TG Received callback query update");
            handleCallback(update);
            return;
        }

        // 2) обычные сообщения
        if (!update.hasMessage() || !update.getMessage().hasText()) return;

        String text = update.getMessage().getText().trim();
        long chatId = update.getMessage().getChatId();

        var from = update.getMessage().getFrom();
        long userId = from != null ? from.getId() : 0;

        log.info("🤖 TG Received message command={} chatId={} userId={}", text, chatId, userId);
        if (handleTrackingReply(update, userId)) {
            return;
        }
        switch (text) {
            case "/start", "/shop" -> sendShopButton(chatId);
            case "/set_admin_chat" -> {
                if (!isAdmin(userId)) {
                    log.warn("🤖 TG Admin chat setup rejected for non-admin userId={}", userId);
                    safeExecute(SendMessage.builder().chatId(chatId).text("⛔ Нет доступа").build());
                    return;
                }
                settings.save(new Setting("ADMIN_CHAT_ID", String.valueOf(chatId)));
                log.info("🤖 TG Admin chat configured chatId={} userId={}", chatId, userId);
                safeExecute(SendMessage.builder().chatId(chatId).text("✅ Этот чат теперь будет получать уведомления о заказах.").build());
            }
            case "/help" -> safeExecute(SendMessage.builder().chatId(chatId).text(
                    "Доступные команды:\n" +
                            "/shop — открыть магазин\n" +
                            "/set_admin_chat — куда слать уведомления о заказах (выполнить в нужном чате)\n" +
                            "/help"
            ).build());
        }
    }

    private void handleCallback(Update update) {
        var cb = update.getCallbackQuery();
        String data = cb.getData();
        long fromUserId = cb.getFrom() != null ? cb.getFrom().getId() : 0;

        // кто нажал — не админ
        if (!isAdmin(fromUserId)) {
            log.warn("🤖 TG Callback rejected for non-admin userId={}", fromUserId);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("⛔ Нет доступа")
                .showAlert(true)
                .build());
            return;
        }

        // разбор callback data
        TelegramNotifyService.OrderDecision decision;
        String uuidStr;

        if (data != null && data.startsWith(TelegramNotifyService.CB_APPROVE_PREFIX)) {
            decision = TelegramNotifyService.OrderDecision.APPROVED;
            uuidStr = data.substring(TelegramNotifyService.CB_APPROVE_PREFIX.length());
        } else if (data != null && data.startsWith(TelegramNotifyService.CB_REJECT_PREFIX)) {
            decision = TelegramNotifyService.OrderDecision.REJECTED;
            uuidStr = data.substring(TelegramNotifyService.CB_REJECT_PREFIX.length());
        } else if (data != null && data.startsWith(TelegramNotifyService.CB_SHIP_PREFIX)) {
            decision = null;
            uuidStr = data.substring(TelegramNotifyService.CB_SHIP_PREFIX.length());
        } else {
            log.warn("🤖 TG Callback rejected: unknown data {}", data);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Неизвестная команда")
                .build());
            return;
        }

        UUID uuid;
        try {
            uuid = UUID.fromString(uuidStr);
        } catch (Exception e) {
            log.warn("🤖 TG Callback rejected: invalid uuid {}", uuidStr);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Некорректный ID заказа")
                .build());
            return;
        }

        try {
            if (decision == null) {
                sendTrackingNumberRequest(cb, uuid);
                return;
            }
            // обновляем статус в БД
            OrderEntity updated = (decision == TelegramNotifyService.OrderDecision.APPROVED)
                ? orderService.approve(uuid)
                : orderService.reject(uuid);

            log.info("🤖 TG Order decision applied uuid={} decision={}", updated.uuid(), decision);

            // обновим сообщение в админ-чате (подпишем статус + уберем кнопки)
            String newText = buildAdminDecisionText(updated, decision, null);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());

            if (decision == TelegramNotifyService.OrderDecision.APPROVED) {
                var shipButton = InlineKeyboardButton.builder()
                    .text("📦 Выслал заказ")
                    .callbackData(TelegramNotifyService.CB_SHIP_PREFIX + updated.uuid().toString())
                    .build();
                var kb = InlineKeyboardMarkup.builder()
                    .keyboard(List.of(List.of(shipButton)))
                    .build();
                safeExecute(EditMessageReplyMarkup.builder()
                    .chatId(String.valueOf(cb.getMessage().getChatId()))
                    .messageId(cb.getMessage().getMessageId())
                    .replyMarkup(kb)
                    .build());
            } else {
                // убрать кнопки полностью (replyMarkup = null)
                safeExecute(EditMessageReplyMarkup.builder()
                    .chatId(String.valueOf(cb.getMessage().getChatId()))
                    .messageId(cb.getMessage().getMessageId())
                    .replyMarkup((InlineKeyboardMarkup) null)
                    .build());
            }

            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text(decision == TelegramNotifyService.OrderDecision.APPROVED ? "✅ Одобрено" : "❌ Отклонено")
                .build());

        } catch (Exception e) {
            log.error("🤖 TG Failed to handle callback decision uuid={} decision={}", uuidStr, decision, e);
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Ошибка при обновлении заказа")
                .showAlert(true)
                .build());
        }
    }

    private String buildAdminDecisionText(OrderEntity order, TelegramNotifyService.OrderDecision decision) {
        String status = decision == TelegramNotifyService.OrderDecision.APPROVED
            ? "✅ <b>ОДОБРЕНО</b>"
            : "❌ <b>ОТКЛОНЕНО</b>";
        return buildAdminDecisionText(order, decision, status);
    }

    private String buildAdminDecisionText(OrderEntity order, TelegramNotifyService.OrderDecision decision, String statusOverride) {
        String status = statusOverride != null ? statusOverride : decision == TelegramNotifyService.OrderDecision.APPROVED
            ? "✅ <b>ОДОБРЕНО</b>"
            : "❌ <b>ОТКЛОНЕНО</b>";
        // Можно оставить тот же текст заказа + добавить статус сверху
        StringBuilder sb = new StringBuilder();
        sb.append(status).append("\n\n");
        sb.append("<b>🛒 Заказ</b>\n");
        sb.append("ID: <code>").append(escapeHtml(order.uuid().toString())).append("</code>\n\n");
        sb.append("👤 ").append(escapeHtml(order.getCustomerName())).append("\n");
        sb.append("📞 ").append(escapeHtml(order.getPhone())).append("\n");
        sb.append("📦 ").append(escapeHtml(order.getAddress())).append("\n");
        if (order.getComment() != null && !order.getComment().isBlank()) {
          sb.append("💬 ").append(escapeHtml(order.getComment())).append("\n");
        }
        sb.append("\n<b>💰 Итого:</b> ")
            .append(order.getTotalMinor())
            .append(" ")
            .append(escapeHtml(order.getCurrency()))
            .append("\n");
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
          sb.append("\n📦 ТТН: ").append(escapeHtml(order.getTrackingNumber())).append("\n");
        }

        sb.append("\n👤 TG: ").append(escapeHtml(String.valueOf(order.getTgUserId())));
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
          sb.append(" (@").append(escapeHtml(order.getTgUsername())).append(")");
        }
        sb.append("\n");

        return sb.toString();
    }

    private void sendTrackingNumberRequest(org.telegram.telegrambots.meta.api.objects.CallbackQuery cb, UUID uuid) {
        ForceReplyKeyboard forceReply = ForceReplyKeyboard.builder()
            .forceReply(true)
            .selective(true)
            .build();

        SendMessage prompt = SendMessage.builder()
            .chatId(String.valueOf(cb.getMessage().getChatId()))
            .parseMode(ParseMode.HTML)
            .text("Введите ТТН для заказа <code>" + escapeHtml(uuid.toString()) + "</code>")
            .replyMarkup(forceReply)
            .build();

        Message promptMessage = safeExecuteMessage(prompt);
        if (promptMessage != null) {
            pendingShipments.put(promptMessage.getMessageId(), new PendingShipment(
                uuid,
                cb.getMessage().getChatId(),
                cb.getMessage().getMessageId()
            ));
        }

        safeExecute(AnswerCallbackQuery.builder()
            .callbackQueryId(cb.getId())
            .text("Введите ТТН")
            .build());
    }

    private boolean handleTrackingReply(Update update, long userId) {
        var message = update.getMessage();
        if (message == null || !message.hasText() || message.getReplyToMessage() == null) {
            return false;
        }
        if (!isAdmin(userId)) {
            return false;
        }

        PendingShipment pending = pendingShipments.remove(message.getReplyToMessage().getMessageId());
        if (pending == null) {
            return false;
        }

        String trackingNumber = message.getText().trim();
        if (trackingNumber.isBlank()) {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
            return true;
        }

        try {
            OrderEntity shipped = orderService.ship(pending.orderId(), trackingNumber);
            String newText = buildAdminDecisionText(shipped, TelegramNotifyService.OrderDecision.APPROVED, "📦 <b>ВЫСЛАНО</b>");
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());
            safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(pending.chatId()))
                .messageId(pending.orderMessageId())
                .replyMarkup((InlineKeyboardMarkup) null)
                .build());
        } catch (Exception e) {
            log.error("🤖 TG Failed to ship order from reply tracking number", e);
            safeExecute(SendMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .text("Ошибка при обновлении заказа. Проверьте ТТН и попробуйте еще раз.")
                .build());
        } finally {
            safeExecute(DeleteMessage.builder()
                .chatId(String.valueOf(message.getChatId()))
                .messageId(message.getMessageId())
                .build());
        }

        return true;
    }

    private void sendShopButton(long chatId) {
        String url = props.getWebapp().getBaseUrl() + "/app/index.html?mode=user";
        var btn = InlineKeyboardButton.builder()
                .text("🛍️ Открыть магазин")
                .webApp(new WebAppInfo(url))
                .build();

        var kb = InlineKeyboardMarkup.builder()
                .keyboardRow(List.of(btn))
                .build();

        log.info("🤖 TG Sending shop button to chatId={}", chatId);
        safeExecute(SendMessage.builder()
                .chatId(chatId)
                .text("Открывай мини-приложение магазина 👇")
                .replyMarkup(kb)
                .build());
    }

    private boolean isAdmin(long userId) {
        Set<Long> admins = props.getTelegram().adminUserIdSet();
        return admins.contains(userId);
    }

    public void safeExecute(SendMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
        }
    }

    public void safeExecute(AnswerCallbackQuery msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to answer callback query", e);
        }
    }

    public void safeExecute(EditMessageText msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message text", e);
        }
    }

    public void safeExecute(EditMessageReplyMarkup msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to edit message reply markup", e);
        }
    }

    public void safeExecute(DeleteMessage msg) {
        try {
            execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to delete message", e);
        }
    }

    public Message safeExecuteMessage(SendMessage msg) {
        try {
            return execute(msg);
        } catch (Exception e) {
            log.error("🤖 TG Failed to send message", e);
            return null;
        }
    }

    private static String escapeHtml(String s) {
      if (s == null) return "";
      return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private record PendingShipment(UUID orderId, long chatId, int orderMessageId) {}
}
