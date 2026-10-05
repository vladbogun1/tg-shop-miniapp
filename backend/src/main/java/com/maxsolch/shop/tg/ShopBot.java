package com.maxsolch.shop.tg;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.security.TelegramUser;
import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
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
import java.util.Locale;

/**
 * Thin long-polling bot. Handles /start and /help, plus the website login: {@code /start
 * login_<nonce>} and the inline-button callbacks it produces (delegated to
 * {@link WebLoginBotHandler}) and [Заблокировать] under admin sign-in alerts
 * ({@link AdminSecurityNotifier}). All rich notifications are sent out-of-band by
 * {@link NotificationService}. Registration happens in TelegramBotConfig and only when a token is
 * configured.
 */
@Slf4j
@Component
public class ShopBot extends TelegramLongPollingBot {

    private final AppProperties props;
    private final AuthService authService;
    private final Messages messages;
    private final WebLoginBotHandler webLogin;
    private final SettingsService settings;
    private final AdminSecurityNotifier adminSecurity;

    public ShopBot(AppProperties props, @Lazy AuthService authService, Messages messages,
                   @Lazy WebLoginBotHandler webLogin, SettingsService settings,
                   @Lazy AdminSecurityNotifier adminSecurity) {
        super(props.getTelegram().getBotToken() == null ? "" : props.getTelegram().getBotToken());
        this.props = props;
        this.authService = authService;
        this.messages = messages;
        this.webLogin = webLogin;
        this.settings = settings;
        this.adminSecurity = adminSecurity;
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
            if (update != null && update.hasCallbackQuery()) {
                onCallback(update.getCallbackQuery());
                return;
            }
            if (update == null || !update.hasMessage() || !update.getMessage().hasText()) {
                return;
            }
            long chatId = update.getMessage().getChatId();
            String text = update.getMessage().getText().trim();
            recordUser(update.getMessage().getFrom());
            String languageCode = update.getMessage().getFrom() == null
                    ? null : update.getMessage().getFrom().getLanguageCode();
            String loginNonce = loginNonce(text);
            if (loginNonce != null) {
                // Only in a private chat: the chat id is then the person confirming the login.
                if (update.getMessage().getChat() != null && update.getMessage().getChat().isUserChat()) {
                    webLogin.onStartLogin(chatId, loginNonce, localeFor(chatId, languageCode));
                }
            } else if (text.startsWith("/start")) {
                sendStart(chatId, languageCode);
            } else if (text.startsWith("/help")) {
                sendHelp(chatId, languageCode);
            }
        } catch (Exception e) {
            log.warn("Bot update handling failed: {}", e.getMessage());
        }
    }

    /** {@code /start login_<nonce>} (also {@code /start@bot login_...}) → the nonce, else null. */
    static String loginNonce(String text) {
        if (text == null || !text.startsWith("/start")) {
            return null;
        }
        int space = text.indexOf(' ');
        if (space < 0) {
            return null;
        }
        String payload = text.substring(space + 1).trim();
        if (!payload.startsWith("login_") || payload.length() <= "login_".length()) {
            return null;
        }
        return payload.substring("login_".length());
    }

    private void onCallback(org.telegram.telegrambots.meta.api.objects.CallbackQuery cq) {
        if (cq.getFrom() == null) {
            return;
        }
        if (AdminSecurityNotifier.handles(cq.getData())) {
            // [Заблокировать] under an admin sign-in alert.
            adminSecurity.onCallback(cq);
            return;
        }
        if (!WebLoginBotHandler.handles(cq.getData())) {
            return;
        }
        recordUser(cq.getFrom());
        webLogin.onCallback(cq, localeFor(cq.getFrom().getId(), cq.getFrom().getLanguageCode()));
    }

    private void sendStart(long chatId, String languageCode) {
        Locale locale = localeFor(chatId, languageCode);
        String webapp = props.getWebappBaseUrl();
        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(chatId))
                .text(startText(locale))
                .build();
        if (webapp != null && !webapp.isBlank()) {
            InlineKeyboardButton btn = InlineKeyboardButton.builder()
                    .text(messages.get(locale, "bot.start.button"))
                    .webApp(WebAppInfo.builder().url(webapp).build())
                    .build();
            msg.setReplyMarkup(InlineKeyboardMarkup.builder()
                    .keyboard(List.of(List.of(btn)))
                    .build());
        }
        executeSafe(msg);
    }

    /** The admin's greeting for this language (Настройки → Бот), else the bundled one. */
    private String startText(Locale locale) {
        String custom = settings.get(SettingsRegistry.BOT_START_TEXT_PREFIX + locale.getLanguage(), "");
        return custom == null || custom.isBlank() ? messages.get(locale, "bot.start.text") : custom;
    }

    private void sendHelp(long chatId, String languageCode) {
        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(chatId))
                .text(messages.get(localeFor(chatId, languageCode), "bot.help.text"))
                .build();
        executeSafe(msg);
    }

    /**
     * The language to greet this person in.
     *
     * <p>On `/start` the `users` row may not exist yet, so what Telegram reports about them is all
     * there is; once they have used the app, the language they PICKED there wins. Both cases are
     * handled by trying the stored preference first and falling back to the reported code.
     */
    private Locale localeFor(long chatId, String languageCode) {
        Locale stored = messages.localeOf(chatId);
        if (stored != null && !stored.equals(Messages.FALLBACK)) {
            return stored;
        }
        Locale reported = Messages.normalize(languageCode);
        return reported != null ? reported : Messages.FALLBACK;
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

    private void executeSafe(SendMessage msg) {
        try {
            execute(msg);
        } catch (TelegramApiException e) {
            log.warn("Failed to send message: {}", e.getMessage());
        }
    }
}
