package com.maxsolch.shop.tg;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.security.TelegramUser;
import com.maxsolch.shop.service.AuthService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.List;

/**
 * Thin long-polling bot. Only handles /start and /help; all rich notifications are sent
 * out-of-band by {@link NotificationService}. Registration happens in TelegramBotConfig and
 * only when a token is configured.
 */
@Slf4j
@Component
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final AuthService authService;

    public ShopBot(AppProperties props, @Lazy AuthService authService) {
        super(props.getTelegram().getBotToken() == null ? "" : props.getTelegram().getBotToken());
        this.props = props;
        this.authService = authService;
    }

    @Override
    public String getBotUsername() {
        String u = props.getTelegram().getBotUsername();
        if (u == null) {
            return "shop_bot";
        }
        return u.startsWith("@") ? u.substring(1) : u;
    }

    @Override
    public void onUpdateReceived(Update update) {
        try {
            if (update == null || !update.hasMessage() || !update.getMessage().hasText()) {
                return;
            }
            long chatId = update.getMessage().getChatId();
            String text = update.getMessage().getText().trim();
            recordUser(update.getMessage().getFrom());
            if (text.startsWith("/start")) {
                sendStart(chatId);
            } else if (text.startsWith("/help")) {
                sendHelp(chatId);
            }
        } catch (Exception e) {
            log.warn("Bot update handling failed: {}", e.getMessage());
        }
    }

    private void sendStart(long chatId) {
        String webapp = props.getWebappBaseUrl();
        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(chatId))
                .text("Добро пожаловать в магазин! Нажмите кнопку ниже, чтобы открыть каталог.")
                .build();
        if (webapp != null && !webapp.isBlank()) {
            InlineKeyboardButton btn = InlineKeyboardButton.builder()
                    .text("🛍️ Открыть магазин")
                    .webApp(WebAppInfo.builder().url(webapp).build())
                    .build();
            msg.setReplyMarkup(InlineKeyboardMarkup.builder()
                    .keyboard(List.of(List.of(btn)))
                    .build());
        }
        execteSafe(msg);
    }

    private void sendHelp(long chatId) {
        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(chatId))
                .text("Команды:\n/start — открыть магазин\n/help — помощь")
                .build();
        execteSafe(msg);
    }

    /** Capture/refresh the user behind a bot message (only private 1:1 chats = real users). */
    private void recordUser(org.telegram.telegrambots.meta.api.objects.User from) {
        if (from == null || Boolean.TRUE.equals(from.getIsBot()) || from.getId() == null) {
            return;
        }
        try {
            authService.recordBotUser(new TelegramUser(
                    from.getId(),
                    from.getUserName(),
                    from.getFirstName(),
                    from.getLastName(),
                    from.getLanguageCode(),
                    Boolean.TRUE.equals(from.getIsPremium()),
                    null));
        } catch (Exception e) {
            log.debug("recordUser failed: {}", e.getMessage());
        }
    }

    private void execteSafe(SendMessage msg) {
        try {
            execute(msg);
        } catch (TelegramApiException e) {
            log.warn("Failed to send message: {}", e.getMessage());
        }
    }
}
