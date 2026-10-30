package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.notification.domain.SellerTopic;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.journal.app.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

import static com.maxsolch.shop.notification.app.TgFormat.isHttps;

/**
 * The seller's side of the bot: the admins' group with its forum topics, best-effort. Knows nothing about
 * orders: it owns WHERE things go (chat id, the topics, the «open in admin» button) and the journal entry of
 * every message; WHAT is said and what a card means is the caller's (the order's seller notifier, the support and
 * pre-order notifiers). Nothing here throws: a Telegram failure is logged and the caller's transaction goes on.
 */
@Slf4j
@Component
public class SellerChannel {

    /**
     * A message that went to the group. {@code confirmed} is false when Telegram's answer carried no message
     * (the ids are then null); {@code threadId} is the topic it was sent to, 0 = none.
     */
    public record Posted(boolean confirmed, Long chatId, Integer messageId, int threadId) {
    }

    /** What happened to an edit of a message in the group. */
    public enum Edited { DONE, NOT_MODIFIED, GONE, FAILED }

    private final TelegramGateway bot;
    private final AppProperties props;
    private final ActivityLog activity;

    public SellerChannel(TelegramGateway bot, AppProperties props, ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.activity = activity;
    }

    /** A bot token is configured. */
    public boolean enabled() {
        return TgFormat.botConfigured(props);
    }

    // ----- chat id: two historical spellings of «not configured» -----

    /** The admins' chat, or null when it is not set (null / blank). */
    private String chatId() {
        String chatId = props.getTelegram().getNotifyChatId();
        return chatId == null || chatId.isBlank() ? null : chatId;
    }

    /** The admins' chat is set (a chat id of {@code "0"} counts as set here, see {@link #chatIdZeroIsUnset()}). */
    public boolean chatConfigured() {
        return chatId() != null;
    }

    /**
     * Known inconsistency, kept on purpose: the payment note and the cancel-request note also treat
     * {@code "0"} as «not configured», while the order cards, the chat ping and the dispatch card send
     * to a chat literally called {@code "0"}. The snapshot tests pin both behaviours.
     */
    private String chatIdZeroIsUnset() {
        String chatId = chatId();
        return chatId == null || "0".equals(chatId.trim()) ? null : chatId;
    }

    private int topicId(SellerTopic topic) {
        AppProperties.Telegram t = props.getTelegram();
        return switch (topic) {
            case NEW -> t.getNotifyTopicNew();
            case PROCESSING -> t.getNotifyTopicProcessing();
            case SHIPPED -> t.getNotifyTopicShipped();
            case CLOSED -> t.getNotifyTopicClosed();
            case REJECTED -> t.getNotifyTopicRejected();
            case CHAT -> t.getNotifyTopicChat();
            case DISPATCH -> t.getNotifyTopicDispatch();
        };
    }

    // ----- cards: a message in a topic that is later edited or deleted -----

    /**
     * Posts an HTML card into a topic of the group with the «open in admin» button ({@code adminPath}), journaled as
     * {@code entry}. The caller's summary is in the entry: cards carry phones and addresses, which do not belong in
     * the journal.
     *
     * @return null when the group is not configured or the send failed (logged as {@code failure})
     */
    public Posted post(String failure, ActivityLog.Entry entry, String text, String adminPath, SellerTopic topic) {
        String chatId = chatId();
        if (chatId == null) {
            return null;
        }
        try {
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(adminButton(adminPath))
                    .build();
            int thread = topicId(topic);
            if (thread > 0) {
                msg.setMessageThreadId(thread);
            }
            Message sent = toAdmins(entry, msg);
            return sent == null
                    ? new Posted(false, null, null, thread)
                    : new Posted(true, sent.getChatId(), sent.getMessageId(), thread);
        } catch (Exception e) {
            log.warn("{}: {}", failure, e.getMessage());
            return null;
        }
    }

    /** Edits a card of the group in place (text and the «open in admin» button). */
    public Edited edit(String failure, Integer messageId, String text, String adminPath) {
        String chatId = chatId();
        if (chatId == null || messageId == null) {
            return Edited.FAILED;
        }
        try {
            bot.execute(EditMessageText.builder()
                    .chatId(chatId)
                    .messageId(messageId)
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(adminButton(adminPath))
                    .build());
            return Edited.DONE; // the message still exists (and is now refreshed)
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
            if (m.contains("not modified")) {
                return Edited.NOT_MODIFIED; // exists, content unchanged
            }
            if (m.contains("message to edit not found") || m.contains("message can't be edited")
                    || m.contains("message_id_invalid") || m.contains("message to delete not found")) {
                return Edited.GONE; // deleted by hand
            }
            log.warn("{}: {}", failure, e.getMessage());
            return Edited.FAILED;
        }
    }

    /** Deletes a message of a known chat (best-effort, a failure is a {@code debug} line). */
    public void delete(String failure, Long chatId, Integer messageId) {
        if (chatId == null || messageId == null) {
            return;
        }
        deleteIn(failure, String.valueOf(chatId), messageId);
    }

    /** Deletes a message of the configured group (best-effort; null id or no group = nothing to do). */
    public void deleteInGroup(String failure, Integer messageId) {
        String chatId = chatId();
        if (messageId == null || chatId == null) {
            return;
        }
        deleteIn(failure, chatId, messageId);
    }

    private void deleteIn(String failure, String chatId, int messageId) {
        try {
            bot.execute(DeleteMessage.builder().chatId(chatId).messageId(messageId).build());
        } catch (Exception e) {
            log.debug("{}: {}", failure, e.getMessage());
        }
    }

    // ----- pings into the «chat messages» topic -----

    /**
     * A note into the chat topic with the «open in admin» button; {@code text} is built inside the guarded block.
     * A chat id of {@code "0"} is NOT treated as unset here (see {@link #chatIdZeroIsUnset()}).
     */
    public void pingChatTopic(String failure, ActivityLog.Entry entry, String adminPath, Supplier<String> text) {
        if (!enabled()) {
            return;
        }
        ping(failure, entry, text, adminPath, chatId());
    }

    /**
     * Same, but a chat id of {@code "0"} counts as «not configured» (the payment, cancel-request and support
     * notes). {@code adminPath} is the admin page the button opens, e.g. {@code /support?thread=…}.
     */
    public void pingChatTopicUnlessZero(String failure, ActivityLog.Entry entry, String adminPath,
                                        Supplier<String> text) {
        if (!enabled()) {
            return;
        }
        ping(failure, entry, text, adminPath, chatIdZeroIsUnset());
    }

    private void ping(String failure, ActivityLog.Entry entry, Supplier<String> text, String adminPath, String chatId) {
        if (chatId == null) {
            return;
        }
        try {
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(text.get())
                    .parseMode("HTML")
                    .replyMarkup(adminButton(adminPath))
                    .build();
            int topic = topicId(SellerTopic.CHAT);
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            toAdmins(entry, msg);
        } catch (Exception e) {
            log.warn("{}: {}", failure, e.getMessage());
        }
    }

    /**
     * A plain HTML note into the chat topic with no button and no order (the daily pre-order digest) to the given
     * chat. Best-effort: a Telegram failure is logged with {@code failure} and swallowed.
     */
    public void postChatTopicNote(String failure, ActivityLog.Entry entry, String chatId, String text) {
        try {
            SendMessage msg = SendMessage.builder().chatId(chatId).text(text).parseMode("HTML").build();
            int topic = topicId(SellerTopic.CHAT);
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            toAdmins(entry, msg);
        } catch (Exception e) {
            log.warn("{}: {}", failure, e.getMessage());
        }
    }

    // ----- a personal DM to one admin -----

    /** The bot is on and this is a real Telegram user (id > 0): an admin's own chat can be written to. */
    public boolean canDmAdmin(long adminId) {
        return enabled() && adminId > 0;
    }

    /**
     * One HTML message into an admin's private chat, journaled as {@code entry} (the caller sets type and
     * summary: an invite link or an alert's IPs do not belong in the journal). Best-effort, and a failure
     * is only an {@code info} line — typically the admin never pressed /start in the bot.
     *
     * @return whether the message went out
     */
    public boolean dmAdmin(String failure, long adminId, ActivityLog.Entry entry, String text, InlineKeyboardMarkup markup) {
        if (!canDmAdmin(adminId)) {
            return false;
        }
        try {
            // The message is built inside the journaled call: a text that cannot be sent is a FAILED row.
            activity.bot(entry.toAdmins(String.valueOf(adminId)), () -> bot.execute(SendMessage.builder()
                    .chatId(String.valueOf(adminId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(markup)
                    .build()));
            return true;
        } catch (Exception e) {
            log.info("{}: {}", failure, e.getMessage());
            return false;
        }
    }

    // ----- plumbing -----

    private Message toAdmins(ActivityLog.Entry entry, SendMessage msg) throws TelegramApiException {
        return activity.bot(entry.toAdmins(msg.getChatId()), () -> bot.execute(msg));
    }

    /** The «open in admin» button for an admin page; null until a public HTTPS admin URL is configured. */
    private InlineKeyboardMarkup adminButton(String adminPath) {
        String adminBase = props.getAdminBaseUrl();
        // Skip buttons until a public HTTPS admin URL is configured (local http://localhost is
        // rejected by Telegram and would fail the whole message send).
        if (!isHttps(adminBase)) {
            return null;
        }
        InlineKeyboardButton open = InlineKeyboardButton.builder()
                .text("🔎 Открыть в админке")
                .url(adminBase + adminPath)
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(open))).build();
    }
}
