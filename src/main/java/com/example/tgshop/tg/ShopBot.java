package com.example.tgshop.tg;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.order.OrderEntity;
import com.example.tgshop.order.OrderService; // <-- добавь свой сервис
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.ParseMode;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageReplyMarkup;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

@Component
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final SettingRepository settings;
    private final OrderService orderService;

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
            handleCallback(update);
            return;
        }

        // 2) обычные сообщения
        if (!update.hasMessage() || !update.getMessage().hasText()) return;

        String text = update.getMessage().getText().trim();
        long chatId = update.getMessage().getChatId();

        var from = update.getMessage().getFrom();
        long userId = from != null ? from.getId() : 0;

        switch (text) {
            case "/start", "/shop" -> sendShopButton(chatId);
            case "/set_admin_chat" -> {
                if (!isAdmin(userId)) {
                    safeExecute(SendMessage.builder().chatId(chatId).text("⛔ Нет доступа").build());
                    return;
                }
                settings.save(new Setting("ADMIN_CHAT_ID", String.valueOf(chatId)));
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
        } else {
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
            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text("Некорректный ID заказа")
                .build());
            return;
        }

        try {
            // обновляем статус в БД
            OrderEntity updated = (decision == TelegramNotifyService.OrderDecision.APPROVED)
                ? orderService.approve(uuid)
                : orderService.reject(uuid);

            // обновим сообщение в админ-чате (подпишем статус + уберем кнопки)
            String newText = buildAdminDecisionText(updated, decision);
            safeExecute(EditMessageText.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .parseMode(ParseMode.HTML)
                .text(newText)
                .build());

            // убрать кнопки полностью (replyMarkup = null)
            safeExecute(EditMessageReplyMarkup.builder()
                .chatId(String.valueOf(cb.getMessage().getChatId()))
                .messageId(cb.getMessage().getMessageId())
                .replyMarkup((InlineKeyboardMarkup) null)
                .build());

            safeExecute(AnswerCallbackQuery.builder()
                .callbackQueryId(cb.getId())
                .text(decision == TelegramNotifyService.OrderDecision.APPROVED ? "✅ Одобрено" : "❌ Отклонено")
                .build());

        } catch (Exception e) {
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

        sb.append("\n👤 TG: ").append(escapeHtml(String.valueOf(order.getTgUserId())));
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
          sb.append(" (@").append(escapeHtml(order.getTgUsername())).append(")");
        }
        sb.append("\n");

        return sb.toString();
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
        } catch (Exception ignored) {}
    }

    public void safeExecute(AnswerCallbackQuery msg) {
        try {
            execute(msg);
        } catch (Exception ignored) {}
    }

    public void safeExecute(EditMessageText msg) {
        try {
            execute(msg);
        } catch (Exception ignored) {}
    }

    public void safeExecute(EditMessageReplyMarkup msg) {
        try {
            execute(msg);
        } catch (Exception ignored) {}
    }

    private static String escapeHtml(String s) {
      if (s == null) return "";
      return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
