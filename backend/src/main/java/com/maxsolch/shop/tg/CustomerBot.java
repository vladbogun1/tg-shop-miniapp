package com.maxsolch.shop.tg;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.List;
import java.util.Locale;
import java.util.function.Function;

import static com.maxsolch.shop.tg.TgFormat.idStr;
import static com.maxsolch.shop.tg.TgFormat.isHttps;

/**
 * The bot talking to ONE customer about ONE of their orders, best-effort.
 *
 * <p>Everything a customer DM has in common lives here, so a notification only has to say what it
 * says: no message when there is no bot token or the order has no Telegram chat; the customer's
 * language; every failure swallowed with a log line (an order or chat transaction never fails
 * because of a Telegram hiccup); every message that goes out written to the «Бот и сайт» journal.
 * The buttons that open the Mini App also live here — they are the customer's, and need the language.
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

    private final ShopBot bot;
    private final AppProperties props;
    private final Messages messages;
    private final ActivityLog activity;

    public CustomerBot(@Lazy ShopBot bot, AppProperties props, Messages messages, ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.activity = activity;
    }

    /** A bot token is configured: worth preparing anything for the customer's DMs at all. */
    public boolean enabled() {
        return TgFormat.botConfigured(props);
    }

    /** The bot is on and the order's customer has a Telegram chat to write to (tg_user_id > 0). */
    public boolean canReach(Order order) {
        return canReach(order.getTgUserId());
    }

    /** The bot is on and this Telegram user is a real chat to write to (id > 0). */
    public boolean canReach(Long tgUserId) {
        return enabled() && tgUserId != null && tgUserId > 0;
    }

    /**
     * Sends one HTML message to the order's customer, in their language ({@code compose} gets it),
     * and records it in the journal as {@code journalType}. Nothing happens when the customer cannot
     * be reached; a failure is logged as «{@code name} failed for order …».
     *
     * @return whether the message went out
     */
    public boolean send(String name, String journalType, Order order, Function<Locale, Dm> compose) {
        if (!canReach(order)) {
            return false;
        }
        return deliver(name + " failed for order " + idStr(order), order.getTgUserId(), journal(journalType, order), compose);
    }

    /**
     * The same for a customer who is not tied to an order (a support thread, a review, a place in the
     * pre-order queue). {@code entry} is the journal row without its text; {@code failure} is the log line
     * prefix for a failed send. {@code compose} may return null: there is nothing to say after all.
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

    /** Journal entry for a message to this order's customer. */
    public ActivityLog.Entry journal(String type, Order order) {
        return ActivityLog.Entry.bot(type).toCustomer(order.getTgUserId()).order(order.getId());
    }

    /** Journal entry for a message that was NOT sent, and why. */
    public void skipped(Order order, String type, String text, String reason) {
        activity.record(journal(type, order).text(text).skipped(reason));
    }

    public Locale localeOf(Order order) {
        return messages.localeOf(order.getTgUserId());
    }

    /**
     * Sends a document to the customer's DMs and records it in {@code entry}. Unlike {@link #send}
     * the failure is thrown: the caller decides what it means (blocked bot, retry, …).
     */
    public Message sendDocument(SendDocument doc, ActivityLog.Entry entry) throws TelegramApiException {
        return activity.bot(entry, () -> bot.sendDocument(doc));
    }

    // ----- buttons that open the Mini App (null while there is no public HTTPS address) -----

    /** Opens the order page itself in the Mini App (deep link view_<id>). */
    public InlineKeyboardMarkup orderButton(Order order, Locale locale) {
        return webAppButton(messages.get(locale, "bot.openOrder"), "?startapp=view_" + idStr(order));
    }

    /** Opens the cart in the Mini App (deep link {@code cart}). */
    public InlineKeyboardMarkup cartButton(Locale locale) {
        return webAppButton(messages.get(locale, "bot.giftCase.toCart"), "?startapp=cart");
    }

    /** Opens the order's chat in the Mini App. */
    public InlineKeyboardMarkup chatButton(Order order, Locale locale) {
        return webAppButton(messages.get(locale, "bot.openChat"), "?startapp=order_" + idStr(order));
    }

    /** Opens the Mini App ({@code startApp} null = its home) with the given button text. */
    public InlineKeyboardMarkup miniAppButton(String text, String startApp) {
        return webAppButton(text, startApp == null ? "" : "?startapp=" + startApp);
    }

    private InlineKeyboardMarkup webAppButton(String text, String startApp) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(text)
                .webApp(WebAppInfo.builder().url(webapp + startApp).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }
}
