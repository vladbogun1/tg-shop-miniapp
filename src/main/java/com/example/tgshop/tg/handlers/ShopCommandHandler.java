package com.example.tgshop.tg.handlers;

import com.example.tgshop.config.AppProperties;
import com.example.tgshop.settings.Setting;
import com.example.tgshop.settings.SettingRepository;
import com.example.tgshop.tg.bot.TelegramBotGateway;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

@Component
@Slf4j
public class ShopCommandHandler {
    private final AppProperties props;
    private final SettingRepository settings;

    public ShopCommandHandler(AppProperties props, SettingRepository settings) {
        this.props = props;
        this.settings = settings;
    }

    public boolean handle(Message message, long userId, TelegramBotGateway gateway) {
        if (message == null || !message.hasText()) {
            return false;
        }
        String text = message.getText().trim();
        long chatId = message.getChatId();

        log.info("🤖 TG Received message command={} chatId={} userId={}", text, chatId, userId);
        switch (text) {
            case "/start", "/shop" -> sendShopButton(chatId, gateway);
            case "/set_admin_chat" -> {
                if (!isAdmin(userId)) {
                    log.warn("🤖 TG Admin chat setup rejected for non-admin userId={}", userId);
                    gateway.safeExecute(SendMessage.builder().chatId(chatId).text("⛔ Нет доступа").build());
                    return true;
                }
                settings.save(new Setting("ADMIN_CHAT_ID", String.valueOf(chatId)));
                log.info("🤖 TG Admin chat configured chatId={} userId={}", chatId, userId);
                gateway.safeExecute(SendMessage.builder()
                    .chatId(chatId)
                    .text("✅ Этот чат теперь будет получать уведомления о заказах.")
                    .build());
            }
            case "/set_orders_new_topic" -> registerOrderTopic(message, userId, gateway, "ADMIN_ORDER_BOARD_NEW",
                "✅ Тема для новых заказов зарегистрирована.");
            case "/set_orders_processing_topic" -> registerOrderTopic(message, userId, gateway, "ADMIN_ORDER_BOARD_PROCESSING",
                "✅ Тема для заказов в обработке зарегистрирована.");
            case "/set_orders_shipped_topic" -> registerOrderTopic(message, userId, gateway, "ADMIN_ORDER_BOARD_SHIPPED",
                "✅ Тема для высланных заказов зарегистрирована.");
            case "/set_orders_closed_topic" -> registerOrderTopic(message, userId, gateway, "ADMIN_ORDER_BOARD_CLOSED",
                "✅ Тема для закрытых заказов зарегистрирована.");
            case "/help" -> gateway.safeExecute(SendMessage.builder()
                .chatId(chatId)
                .text("Доступные команды:\n" +
                    "/shop — открыть магазин\n" +
                    "/set_admin_chat — куда слать уведомления о заказах (выполнить в нужном чате)\n" +
                    "/set_orders_new_topic — зарегистрировать тему для новых заказов\n" +
                    "/set_orders_processing_topic — зарегистрировать тему для заказов в обработке\n" +
                    "/set_orders_shipped_topic — зарегистрировать тему для высланных заказов\n" +
                    "/set_orders_closed_topic — зарегистрировать тему для закрытых заказов\n" +
                    "/help")
                .build());
            default -> {
                return false;
            }
        }
        return true;
    }

    private void sendShopButton(long chatId, TelegramBotGateway gateway) {
        String url = props.getWebapp().getBaseUrl() + "/app/index.html?mode=user";
        var btn = InlineKeyboardButton.builder()
            .text("🛍️ Открыть магазин")
            .webApp(new WebAppInfo(url))
            .build();

        var kb = InlineKeyboardMarkup.builder()
            .keyboardRow(java.util.List.of(btn))
            .build();

        log.info("🤖 TG Sending shop button to chatId={}", chatId);
        gateway.safeExecute(SendMessage.builder()
            .chatId(chatId)
            .text("Открывай мини-приложение магазина 👇")
            .replyMarkup(kb)
            .build());
    }

    private boolean isAdmin(long userId) {
        Set<Long> admins = props.getTelegram().adminUserIdSet();
        return admins.contains(userId);
    }

    private void registerOrderTopic(
        Message message,
        long userId,
        TelegramBotGateway gateway,
        String settingKey,
        String successText
    ) {
        long chatId = message.getChatId();
        if (!isAdmin(userId)) {
            log.warn("🤖 TG Order topic setup rejected for non-admin userId={}", userId);
            gateway.safeExecute(SendMessage.builder().chatId(chatId).text("⛔ Нет доступа").build());
            return;
        }
        Integer threadId = message.getMessageThreadId();
        if (threadId == null) {
            gateway.safeExecute(SendMessage.builder()
                .chatId(chatId)
                .text("⛔ Выполните команду внутри темы (forum topic).")
                .build());
            return;
        }
        settings.save(new Setting(settingKey, chatId + ":" + threadId));
        log.info("🤖 TG Order topic configured key={} chatId={} threadId={} userId={}",
            settingKey, chatId, threadId, userId);
        gateway.safeExecute(SendMessage.builder()
            .chatId(chatId)
            .messageThreadId(threadId)
            .text(successText)
            .build());
    }
}
