package com.maxsolch.shop.tg;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.service.WebAuthService;
import com.maxsolch.shop.service.WebAuthService.BotDecision;
import com.maxsolch.shop.service.WebAuthService.BotPrompt;
import com.maxsolch.shop.service.WebAuthService.WebLoginCompletedEvent;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.CallbackQuery;
import org.telegram.telegrambots.meta.api.objects.MaybeInaccessibleMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static com.maxsolch.shop.common.Texts.escHtml;

/**
 * The bot's half of the website login (see {@link WebAuthService}).
 *
 * <ul>
 *   <li>{@code /start login_<nonce>} → "Sign-in to chisetup.com.ua · Chrome, Windows — pick the
 *       number you see on the website" with three numbers and "This is not me".</li>
 *   <li>{@code wl:<loginId>:<n>} / {@code wl:<loginId>:x} → confirm / reject, message edited.</li>
 *   <li>After the browser completes: "Signed in to the website · …" + [End this session]
 *       ({@code ws:<sessionId>:end}).</li>
 * </ul>
 * All texts are customer-facing, so they come from {@code messages_*.properties}.
 */
@Slf4j
@Component
public class WebLoginBotHandler {

    static final String LOGIN_PREFIX = "wl:";
    static final String SESSION_PREFIX = "ws:";

    private final ShopBot bot;
    private final WebAuthService webAuthService;
    private final Messages messages;
    private final AppProperties props;
    private final ActivityLog activity;
    /** Notifications after a site login are sent off the HTTP request thread. */
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "web-login-bot");
        t.setDaemon(true);
        return t;
    });

    public WebLoginBotHandler(@Lazy ShopBot bot, WebAuthService webAuthService, Messages messages,
                              AppProperties props, ActivityLog activity) {
        this.bot = bot;
        this.webAuthService = webAuthService;
        this.messages = messages;
        this.props = props;
        this.activity = activity;
    }

    public static boolean handles(String callbackData) {
        return callbackData != null
                && (callbackData.startsWith(LOGIN_PREFIX) || callbackData.startsWith(SESSION_PREFIX));
    }

    /** {@code /start login_<nonce>} in a private chat. */
    public void onStartLogin(long chatId, String nonce, Locale locale) {
        Optional<BotPrompt> prompt = webAuthService.openFromBot(nonce, chatId);
        if (prompt.isEmpty()) {
            send("LOGIN_EXPIRED", chatId, SendMessage.builder()
                    .chatId(String.valueOf(chatId))
                    .text(messages.get(locale, "bot.login.expired"))
                    .build());
            return;
        }
        BotPrompt p = prompt.get();
        List<InlineKeyboardButton> numbers = new ArrayList<>();
        for (Integer n : p.choices()) {
            numbers.add(InlineKeyboardButton.builder()
                    .text(String.valueOf(n))
                    .callbackData(LOGIN_PREFIX + p.loginId() + ":" + n)
                    .build());
        }
        InlineKeyboardButton notMe = InlineKeyboardButton.builder()
                .text(messages.get(locale, "bot.login.notMe"))
                .callbackData(LOGIN_PREFIX + p.loginId() + ":x")
                .build();
        SendMessage msg = SendMessage.builder()
                .chatId(String.valueOf(chatId))
                .text(messages.get(locale, "bot.login.prompt", escHtml(p.deviceLabel())))
                .parseMode("HTML")
                .replyMarkup(InlineKeyboardMarkup.builder()
                        .keyboard(List.of(numbers, List.of(notMe)))
                        .build())
                .build();
        Message sent = send("LOGIN_PROMPT", chatId, msg);
        if (sent != null) {
            webAuthService.attachBotMessage(p.loginId(), chatId, sent.getMessageId());
        }
    }

    /** A press on one of our inline buttons. */
    public void onCallback(CallbackQuery cq, Locale locale) {
        String data = cq.getData();
        long fromId = cq.getFrom().getId();
        String text;
        if (data.startsWith(LOGIN_PREFIX)) {
            String[] parts = data.substring(LOGIN_PREFIX.length()).split(":");
            Integer chosen = null;
            if (parts.length == 2 && !"x".equals(parts[1])) {
                try {
                    chosen = Integer.parseInt(parts[1]);
                } catch (NumberFormatException e) {
                    chosen = -1; // malformed = wrong
                }
            }
            BotDecision decision = parts.length == 2
                    ? webAuthService.decideFromBot(parts[0], fromId, chosen)
                    : BotDecision.INVALID;
            activity.record(ActivityLog.Entry.of(ActivityLog.SITE, switch (decision) {
                        case CONFIRMED -> "LOGIN_CONFIRMED";
                        case REJECTED -> "LOGIN_REJECTED";
                        case EXPIRED, INVALID -> "LOGIN_EXPIRED";
                    }).customer(fromId)
                    .result(decision == BotDecision.CONFIRMED ? ActivityLog.OK
                            : decision == BotDecision.REJECTED ? ActivityLog.SKIPPED : ActivityLog.FAILED)
                    .text(switch (decision) {
                        case CONFIRMED -> "Вход на сайт подтверждён в боте";
                        case REJECTED -> "Покупатель нажал «Это не я» — вход на сайт отклонён";
                        case EXPIRED -> "Подтверждение входа на сайт: ссылка устарела";
                        case INVALID -> "Подтверждение входа на сайт: выбран неверный код или чужая ссылка";
                    }));
            text = switch (decision) {
                case CONFIRMED -> messages.get(locale, "bot.login.confirmed");
                case REJECTED -> messages.get(locale, "bot.login.cancelled");
                case EXPIRED, INVALID -> messages.get(locale, "bot.login.expired");
            };
        } else {
            String[] parts = data.substring(SESSION_PREFIX.length()).split(":");
            Optional<String> ended = parts.length == 2 && "end".equals(parts[1])
                    ? webAuthService.revokeFromBot(parts[0], fromId)
                    : Optional.empty();
            text = ended.map(device -> messages.get(locale, "bot.login.sessionEnded", escHtml(device)))
                    .orElse(null);
            ended.ifPresent(device -> activity.record(ActivityLog.Entry.of(ActivityLog.SITE, "SESSION_ENDED")
                    .customer(fromId).text("Сеанс на сайте завершён из бота: " + device)));
        }
        answer(cq.getId());
        MaybeInaccessibleMessage m = cq.getMessage();
        if (text != null && m != null) {
            edit(m.getChatId(), m.getMessageId(), text);
        }
    }

    /** After the browser finished the login (only once the session row is committed). */
    @TransactionalEventListener(fallbackExecution = true)
    public void onLoginCompleted(WebLoginCompletedEvent e) {
        activity.record(ActivityLog.Entry.of(ActivityLog.SITE, "LOGIN").customer(e.telegramUserId())
                .text("Вход на сайт через бота: " + e.deviceLabel()));
        if (!enabled()) {
            return;
        }
        executor.execute(() -> {
            Locale locale = messages.localeOf(e.telegramUserId());
            InlineKeyboardButton end = InlineKeyboardButton.builder()
                    .text(messages.get(locale, "bot.login.endSession"))
                    .callbackData(SESSION_PREFIX + e.sessionId() + ":end")
                    .build();
            send("LOGIN_DONE", e.telegramUserId(), SendMessage.builder()
                    .chatId(String.valueOf(e.telegramUserId()))
                    .text(messages.get(locale, "bot.login.done", escHtml(e.deviceLabel())))
                    .parseMode("HTML")
                    .replyMarkup(InlineKeyboardMarkup.builder().keyboard(List.of(List.of(end))).build())
                    .build());
        });
    }

    // ------------------------------------------------------------------ telegram plumbing

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

    private Message send(String type, long chatId, SendMessage msg) {
        try {
            return activity.bot(ActivityLog.Entry.bot(type).toCustomer(chatId).text(msg.getText()),
                    () -> bot.execute(msg));
        } catch (TelegramApiException e) {
            log.warn("Login bot message failed: {}", e.getMessage());
            return null;
        }
    }

    private void edit(Long chatId, Integer messageId, String text) {
        try {
            bot.execute(EditMessageText.builder()
                    .chatId(String.valueOf(chatId))
                    .messageId(messageId)
                    .text(text)
                    .parseMode("HTML")
                    .build());
        } catch (TelegramApiException e) {
            log.debug("Login bot edit failed: {}", e.getMessage());
        }
    }

    private void answer(String callbackQueryId) {
        try {
            bot.execute(AnswerCallbackQuery.builder().callbackQueryId(callbackQueryId).build());
        } catch (TelegramApiException e) {
            log.debug("answerCallbackQuery failed: {}", e.getMessage());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
