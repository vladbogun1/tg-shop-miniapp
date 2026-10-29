package com.maxsolch.shop.tg;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.journal.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.util.List;
import java.util.function.Supplier;

import static com.maxsolch.shop.tg.TgFormat.idStr;
import static com.maxsolch.shop.tg.TgFormat.isHttps;
import static com.maxsolch.shop.tg.TgFormat.shortId;

/**
 * The seller's side of the bot: the admins' group with its forum topics, best-effort.
 *
 * <p>Owns where things go (chat id, one topic per order status, a topic for chat pings and one for the
 * dispatch list), the life of an order's card there (post → move to the topic of the new status → delete),
 * the «К ОТПРАВКЕ» card with its self-healing sync, and the journal entry of every message. The text of
 * the cards is {@link SellerCards}; the texts of one-off pings come from the caller. Like the customer
 * side, nothing here throws: a Telegram failure is logged and the order transaction goes on.
 */
@Slf4j
@Component
public class SellerChannel {

    private final ShopBot bot;
    private final AppProperties props;
    private final ActivityLog activity;

    public SellerChannel(@Lazy ShopBot bot, AppProperties props, ActivityLog activity) {
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

    /**
     * Known inconsistency, kept on purpose: the payment note and the cancel-request note also treat
     * {@code "0"} as «not configured», while the order cards, the chat ping and the dispatch card send
     * to a chat literally called {@code "0"}. The snapshot tests pin both behaviours.
     */
    private String chatIdZeroIsUnset() {
        String chatId = chatId();
        return chatId == null || "0".equals(chatId.trim()) ? null : chatId;
    }

    // ----- order cards: one per order, in the topic of its status -----

    /** Forum topic (message_thread_id) for an order status, or 0 if unset. */
    private int topicForStatus(OrderStatus status) {
        AppProperties.Telegram t = props.getTelegram();
        if (status == null) {
            return t.getNotifyTopicNew();
        }
        return switch (status) {
            case NEW -> t.getNotifyTopicNew();
            case APPROVED -> t.getNotifyTopicProcessing();
            case SHIPPED -> t.getNotifyTopicShipped();
            case DELIVERED -> t.getNotifyTopicClosed();
            case REJECTED -> t.getNotifyTopicRejected();
        };
    }

    /** New order → post a card into the topic of its status; store chat/thread/message ids. */
    public void postOrderCard(Order order) {
        if (!enabled()) {
            return;
        }
        postCard(order);
    }

    /** Status changed → MOVE the card: delete from the old topic and re-post into the new one. */
    public void moveOrderCard(Order order) {
        if (!enabled()) {
            return;
        }
        try {
            deleteCard(order);
            postCard(order);
        } catch (Exception e) {
            log.warn("onStatusChanged notification failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Post a fresh order card into the topic for its current status; store chat/thread/message ids. */
    private void postCard(Order order) {
        String chatId = chatId();
        if (chatId == null) {
            return;
        }
        SendMessage msg = SendMessage.builder()
                .chatId(chatId)
                .text(SellerCards.buildCard(order))
                .parseMode("HTML")
                .replyMarkup(adminButtons(order))
                .build();
        int topic = topicForStatus(order.getStatus());
        if (topic > 0) {
            msg.setMessageThreadId(topic);
        }
        try {
            Message sent = toAdmins("ADMIN_ORDER_CARD", order, msg,
                    "Карточка заказа #" + shortId(order) + " → тема «" + SellerCards.statusTopicName(order.getStatus()) + "»");
            if (sent != null && sent.getChatId() != null) {
                order.setNotifyChatId(sent.getChatId());
            }
            order.setNotifyThreadId(topic > 0 ? topic : null);
            if (sent != null) {
                order.setNotifyMessageId(sent.getMessageId());
            }
        } catch (Exception e) {
            log.warn("postCard failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Delete a previously posted card (best-effort). */
    private void deleteCard(Order order) {
        Long chatId = order.getNotifyChatId();
        Integer messageId = order.getNotifyMessageId();
        if (chatId == null || messageId == null) {
            return;
        }
        try {
            bot.execute(DeleteMessage.builder()
                    .chatId(String.valueOf(chatId))
                    .messageId(messageId)
                    .build());
        } catch (Exception e) {
            log.debug("deleteCard failed for order {}: {}", idStr(order), e.getMessage());
        }
        order.setNotifyMessageId(null);
    }

    // ----- pings into the «chat messages» topic -----

    /**
     * A note about this order into the chat topic, with the «open in admin» button. {@code text} is
     * built inside the guarded block; {@code journalSummary} replaces it in the journal. A chat id of
     * {@code "0"} is NOT treated as unset here (see {@link #chatIdZeroIsUnset()}).
     */
    public void pingChatTopic(String name, String journalType, Order order, String journalSummary,
                              Supplier<String> text) {
        if (!enabled()) {
            return;
        }
        ping(name + " failed for order " + idStr(order), orderEntry(journalType, order, journalSummary), text,
                "/orders/" + idStr(order), chatId());
    }

    /** Same, but a chat id of {@code "0"} counts as «not configured» (payment and cancel-request notes). */
    public void pingChatTopicUnlessZero(String name, String journalType, Order order, String journalSummary,
                                        Supplier<String> text) {
        if (!enabled()) {
            return;
        }
        ping(name + " failed for order " + idStr(order), orderEntry(journalType, order, journalSummary), text,
                "/orders/" + idStr(order), chatIdZeroIsUnset());
    }

    /**
     * A note into the chat topic that is not about an order (a support thread): the caller's journal
     * entry (type, customer, details, summary) and the admin page the button opens ({@code adminPath},
     * e.g. {@code /support?thread=…}). A chat id of {@code "0"} counts as «not configured».
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
            int topic = props.getTelegram().getNotifyTopicChat();
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

    // ----- the «К ОТПРАВКЕ» card -----

    /**
     * Post a dispatch card to the seller's "Отправка" topic and remember its message id on the
     * order, so it can later be removed when the order ships. Idempotent: if the order already has
     * a tracked dispatch card we do nothing (avoids duplicates from re-runs / the sync button).
     * The id is stored on the managed entity and flushed by the caller's transaction.
     * Returns {@code true} if a new card was actually posted.
     */
    public boolean postDispatchCard(Order order) {
        String chatId = chatId();
        if (chatId == null || order.getDispatchMessageId() != null) {
            return false;
        }
        try {
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(SellerCards.buildDispatchCard(order))
                    .parseMode("HTML")
                    .replyMarkup(adminButtons(order))
                    .build();
            int topic = props.getTelegram().getNotifyTopicDispatch();
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            Message sent = toAdmins("ADMIN_DISPATCH_CARD", order, msg, "Карточка «К отправке» #" + shortId(order));
            if (sent != null) {
                order.setDispatchMessageId(sent.getMessageId());
                return true;
            }
        } catch (Exception e) {
            log.warn("postDispatchCard failed for order {}: {}", idStr(order), e.getMessage());
        }
        return false;
    }

    /**
     * Reconcile one APPROVED order's dispatch card with Telegram, self-healing manual deletions:
     * if we have a tracked id we try to edit the message in place (which also refreshes the COD
     * line) — and if Telegram reports the message is gone, we clear the stale id and re-post a
     * fresh card. If we have no id, we post one. Returns {@code true} when a NEW card was posted
     * (i.e. it was missing or had been deleted), so the sync button can report a real count.
     */
    public boolean syncDispatchCard(Order order) {
        String chatId = chatId();
        if (chatId == null) {
            return false;
        }
        Integer messageId = order.getDispatchMessageId();
        if (messageId == null) {
            return postDispatchCard(order);
        }
        try {
            EditMessageText edit = EditMessageText.builder()
                    .chatId(chatId)
                    .messageId(messageId)
                    .text(SellerCards.buildDispatchCard(order))
                    .parseMode("HTML")
                    .replyMarkup(adminButtons(order))
                    .build();
            bot.execute(edit);
            return false; // edit succeeded → the message still exists (and is now refreshed)
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
            if (m.contains("not modified")) {
                return false; // exists, content unchanged
            }
            if (m.contains("message to edit not found") || m.contains("message can't be edited")
                    || m.contains("message_id_invalid") || m.contains("message to delete not found")) {
                // The seller deleted it by hand — drop the stale id and re-post a fresh card.
                order.setDispatchMessageId(null);
                return postDispatchCard(order);
            }
            log.warn("syncDispatchCard failed for order {}: {}", idStr(order), e.getMessage());
            return false;
        }
    }

    /**
     * Remove the dispatch card once the order leaves APPROVED (shipped / delivered / cancelled),
     * so the "Отправка" topic only ever shows what still needs shipping. Best-effort; clears the
     * tracked id either way so the card is never re-deleted.
     */
    public void removeDispatchCard(Order order) {
        removeDispatchCard(order.getDispatchMessageId());
        order.setDispatchMessageId(null);
    }

    /** Deletes a dispatch card by its message id (best-effort; null = nothing to do). */
    public void removeDispatchCard(Integer messageId) {
        String chatId = chatId();
        if (messageId == null || chatId == null) {
            return;
        }
        try {
            bot.execute(DeleteMessage.builder()
                    .chatId(chatId)
                    .messageId(messageId)
                    .build());
        } catch (Exception e) {
            log.debug("removeDispatchCard failed for message {}: {}", messageId, e.getMessage());
        }
    }

    // ----- plumbing -----

    /**
     * Sends a message to the admins' chat and records it. {@code summary} replaces the text in the
     * journal: the seller's cards carry the customer's phone and address, which do not belong there.
     */
    private Message toAdmins(String type, Order order, SendMessage msg, String summary) throws TelegramApiException {
        return toAdmins(orderEntry(type, order, summary), msg);
    }

    private Message toAdmins(ActivityLog.Entry entry, SendMessage msg) throws TelegramApiException {
        return activity.bot(entry.toAdmins(msg.getChatId()), () -> bot.execute(msg));
    }

    private static ActivityLog.Entry orderEntry(String type, Order order, String summary) {
        return ActivityLog.Entry.bot(type).order(order.getId()).customer(order.getTgUserId()).text(summary);
    }

    private InlineKeyboardMarkup adminButtons(Order order) {
        return adminButton("/orders/" + idStr(order));
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
