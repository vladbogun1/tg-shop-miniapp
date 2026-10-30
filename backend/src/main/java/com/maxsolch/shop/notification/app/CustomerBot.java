package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.notification.infra.NotificationProperties;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.journal.app.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

import static com.maxsolch.shop.notification.app.TgFormat.isHttps;

/**
 * The bot talking to ONE customer, best-effort. It knows nothing about orders: the notifier of the module that owns
 * the event brings the text, the journal entry and the rules of when to stay silent.
 *
 * <p>Everything a customer DM has in common lives here: no message when there is no bot token or no Telegram chat;
 * the customer's language; every failure swallowed with a log line (a business transaction never fails because of a
 * Telegram hiccup); every message that goes out written to the «Бот и сайт» journal. The button that opens the Mini
 * App lives here too: it needs the public address and is the customer's.
 */
@Slf4j
@Component
public class CustomerBot {

    /**
     * What to send: the HTML text, the (optional) inline keyboard and what the journal keeps instead
     * of the text (null = the text itself; a personal promo code, say, does not belong in the journal).
     */
    public record Dm(String text, InlineKeyboardMarkup markup, String journalText) {

        public Dm(String text, InlineKeyboardMarkup markup) {
            this(text, markup, text);
        }
    }

    private final TelegramGateway bot;
    private final NotificationProperties props;
    private final Messages messages;
    private final ActivityLog activity;

    public CustomerBot(TelegramGateway bot, NotificationProperties props, Messages messages, ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.activity = activity;
    }

    /** A bot token is configured: worth preparing anything for the customer's DMs at all. */
    public boolean enabled() {
        return TgFormat.botConfigured(props);
    }

    /** The bot is on and this Telegram user is a real chat to write to (id > 0). */
    public boolean canReach(Long tgUserId) {
        return enabled() && tgUserId != null && tgUserId > 0;
    }

    /**
     * Sends one HTML message to a customer in their language ({@code compose} gets it) and records it in the journal
     * as {@code entry} (the journal row without its text). {@code failure} is the log line prefix for a failed send.
     * {@code compose} may return null: there is nothing to say after all.
     *
     * @return whether the message went out
     */
    public boolean sendTo(String failure, Long tgUserId, ActivityLog.Entry entry, Function<Locale, Dm> compose) {
        return canReach(tgUserId) && deliver(failure, tgUserId, entry, compose);
    }

    private boolean deliver(String failure, Long tgUserId, ActivityLog.Entry entry, Function<Locale, Dm> compose) {
        try {
            Dm dm = compose.apply(messages.localeOf(tgUserId));
            if (dm == null) {
                return false;
            }
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(dm.text())
                    .parseMode("HTML")
                    .replyMarkup(dm.markup())
                    .build();
            activity.bot(entry.text(dm.journalText()), () -> bot.execute(msg));
            return true;
        } catch (Exception e) {
            log.warn("{}: {}", failure, e.getMessage());
            return false;
        }
    }

    /** Journal entry for a message that was NOT sent, and why. */
    public void skipped(ActivityLog.Entry entry, String text, String reason) {
        activity.record(entry.text(text).skipped(reason));
    }

    /** The language this Telegram user chose (else the bundle's fallback). */
    public Locale localeOf(Long tgUserId) {
        return messages.localeOf(tgUserId);
    }

    /**
     * Sends a PDF to the customer's DMs and records it in {@code entry}. Unlike {@link #sendTo} the failure is
     * thrown: the caller decides what it means (blocked bot, retry, …).
     */
    public Message sendDocument(Long tgUserId, byte[] content, String fileName, String captionHtml,
                                InlineKeyboardMarkup markup, ActivityLog.Entry entry) throws TelegramApiException {
        SendDocument doc = SendDocument.builder()
                .chatId(String.valueOf(tgUserId))
                .document(new InputFile(new ByteArrayInputStream(content), fileName))
                .caption(captionHtml)
                .parseMode("HTML")
                .replyMarkup(markup)
                .build();
        return activity.bot(entry, () -> bot.execute(doc));
    }

    /**
     * A button that opens the Mini App with the given text ({@code startApp} null = its home; otherwise the deep
     * link such as {@code view_<id>}, {@code order_<id>} or {@code cart}); null while there is no public HTTPS address.
     */
    public InlineKeyboardMarkup miniAppButton(String text, String startApp) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(text)
                .webApp(WebAppInfo.builder().url(webapp + (startApp == null ? "" : "?startapp=" + startApp)).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }
}
