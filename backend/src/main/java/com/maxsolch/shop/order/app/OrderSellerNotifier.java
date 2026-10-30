package com.maxsolch.shop.order.app;

import com.maxsolch.shop.notification.app.SellerChannel;
import com.maxsolch.shop.notification.domain.SellerTopic;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.journal.ActivityLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

import static com.maxsolch.shop.notification.app.TgFormat.money;
import static com.maxsolch.shop.notification.app.TgFormat.nz;
import static com.maxsolch.shop.notification.app.TgFormat.trim;
import static com.maxsolch.shop.order.app.OrderTg.idStr;
import static com.maxsolch.shop.order.app.OrderTg.shortId;
import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * What the order tells the seller in the admins' group: the order's card (one per order, in the topic of its
 * status: post, move, delete), the «К ОТПРАВКЕ» card with its self-healing sync, and the pings into the chat topic.
 * The texts are {@link SellerCards} (Russian: the seller reads Russian); where messages go is {@link SellerChannel}.
 * Best-effort like the customer side: a Telegram failure is logged and the order transaction goes on.
 */
@Slf4j
@Component
public class OrderSellerNotifier {

    private final SellerChannel channel;

    public OrderSellerNotifier(SellerChannel channel) {
        this.channel = channel;
    }

    /** New order → post a card into the topic of its status. */
    public void onNewOrder(Order order) {
        if (!channel.enabled()) {
            return;
        }
        postCard(order);
    }

    /** Status changed → MOVE the card: delete from the old topic and re-post into the new one. */
    public void onStatusChanged(Order order) {
        if (!channel.enabled()) {
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
        if (!channel.chatConfigured()) {
            return;
        }
        SellerChannel.Posted sent = channel.post("postCard failed for order " + idStr(order),
                entry("ADMIN_ORDER_CARD", order, "Карточка заказа #" + shortId(order) + " → тема «"
                        + SellerCards.statusTopicName(order.getStatus()) + "»"),
                SellerCards.buildCard(order), adminPath(order), topicFor(order.getStatus()));
        if (sent == null) {
            return;
        }
        order.rememberSellerCard(sent.chatId(), sent.threadId(), sent.messageId(), sent.confirmed());
    }

    /** Delete a previously posted card (best-effort). */
    private void deleteCard(Order order) {
        Long chatId = order.getNotifyChatId();
        Integer messageId = order.getNotifyMessageId();
        if (chatId == null || messageId == null) {
            return;
        }
        channel.delete("deleteCard failed for order " + idStr(order), chatId, messageId);
        order.forgetSellerCard();
    }

    private static SellerTopic topicFor(OrderStatus status) {
        if (status == null) {
            return SellerTopic.NEW;
        }
        return switch (status) {
            case NEW -> SellerTopic.NEW;
            case APPROVED -> SellerTopic.PROCESSING;
            case SHIPPED -> SellerTopic.SHIPPED;
            case DELIVERED -> SellerTopic.CLOSED;
            case REJECTED -> SellerTopic.REJECTED;
        };
    }

    // ----- pings into the «chat messages» topic -----

    /** Customer posted a chat message → notify admins in the "chat messages" topic with an open button. */
    public void onCustomerChatMessage(Order order, String preview) {
        channel.pingChatTopic("onCustomerChatMessage failed for order " + idStr(order),
                entry("ADMIN_CHAT_PING", order, "Сообщение покупателя в чате заказа #" + shortId(order)),
                adminPath(order), () -> {
                    StringBuilder t = new StringBuilder();
                    t.append("💬 <b>Новое сообщение от клиента</b>\n");
                    t.append("Заказ <b>#").append(shortId(order)).append("</b> · ")
                            .append(escHtml(nz(order.getCustomerName()))).append('\n');
                    if (preview != null && !preview.isBlank()) {
                        t.append("<blockquote>").append(escHtml(trim(preview, 200))).append("</blockquote>");
                    }
                    return t.toString();
                });
    }

    /**
     * Money arrived online (monobank): a note in the chat topic — the order still waits for the admins' manual
     * confirmation. (The customer's DM is {@link OrderCustomerNotifier#onPaymentReceived}.)
     */
    public void onPaymentReceived(Order order, long amountMinor) {
        String cur = nz(order.getCurrency());
        pingUnlessZero("onPaymentReceived (admins)", "ADMIN_PAYMENT", order,
                "Оплачено онлайн по заказу #" + shortId(order) + ": " + money(amountMinor) + " " + cur, () -> {
                    long cod = Math.max(0, order.getTotalMinor() - Math.min(order.getReceivedMinor(), order.getTotalMinor()));
                    return "💳 <b>Оплачено онлайн (monobank)</b>\n"
                            + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                            + "Поступило: <b>" + money(amountMinor) + " " + cur + "</b>"
                            + (cod > 0 ? " · наложка <b>" + money(cod) + " " + cur + "</b>" : " · оплачен полностью") + "\n"
                            + "<i>Проверьте наличие и подтвердите заказ. Если товара нет — верните деньги в карточке заказа.</i>";
                });
    }

    /** The customer asked to cancel a paid order → admins, in the chat topic, with an open button. */
    public void onCancelRequested(Order order) {
        pingUnlessZero("onCancelRequested", "ADMIN_CANCEL_REQUEST", order,
                "Запрос отмены заказа #" + shortId(order), () -> {
                    String cur = nz(order.getCurrency());
                    long received = OrderMoney.receivedMinor(order);
                    return "🛑 <b>Запрос отмены</b>\n"
                            + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                            + "Оплачено: <b>" + money(received) + " " + cur + "</b>\n"
                            + "<blockquote>" + escHtml(trim(nz(order.getCancelRequestReason()), 300)) + "</blockquote>\n"
                            + "<i>Одобрите (отмена + возврат денег на карту) или отклоните в карточке заказа.</i>";
                });
    }

    private void pingUnlessZero(String name, String journalType, Order order, String journalSummary,
                                Supplier<String> text) {
        channel.pingChatTopicUnlessZero(name + " failed for order " + idStr(order),
                entry(journalType, order, journalSummary), adminPath(order), text);
    }

    // ----- the «К ОТПРАВКЕ» card -----

    /**
     * Post a dispatch card to the seller's "Отправка" topic and remember its message id on the
     * order, so it can later be removed when the order ships. Idempotent: if the order already has
     * a tracked dispatch card we do nothing (avoids duplicates from re-runs / the sync button).
     * The id is stored on the managed entity and flushed by the caller's transaction.
     *
     * @return {@code true} if a new card was actually posted
     */
    public boolean postDispatchCard(Order order) {
        if (!channel.chatConfigured() || order.getDispatchMessageId() != null) {
            return false;
        }
        try {
            SellerChannel.Posted sent = channel.post("postDispatchCard failed for order " + idStr(order),
                    entry("ADMIN_DISPATCH_CARD", order, "Карточка «К отправке» #" + shortId(order)),
                    SellerCards.buildDispatchCard(order), adminPath(order), SellerTopic.DISPATCH);
            if (sent != null && sent.confirmed()) {
                order.rememberDispatchCard(sent.messageId());
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
     * fresh card. If we have no id, we post one.
     *
     * @return {@code true} when a NEW card was posted (it was missing or had been deleted), so the sync button can
     *         report a real count
     */
    public boolean syncDispatchCard(Order order) {
        if (!channel.chatConfigured()) {
            return false;
        }
        Integer messageId = order.getDispatchMessageId();
        if (messageId == null) {
            return postDispatchCard(order);
        }
        try {
            SellerChannel.Edited edited = channel.edit("syncDispatchCard failed for order " + idStr(order),
                    messageId, SellerCards.buildDispatchCard(order), adminPath(order));
            if (edited == SellerChannel.Edited.GONE) {
                // The seller deleted it by hand — drop the stale id and re-post a fresh card.
                order.forgetDispatchCard();
                return postDispatchCard(order);
            }
            return false;
        } catch (Exception e) {
            log.warn("syncDispatchCard failed for order {}: {}", idStr(order), e.getMessage());
            return false;
        }
    }

    /**
     * Remove the dispatch card once the order leaves APPROVED (shipped / delivered / cancelled), so the "Отправка"
     * topic only ever shows what still needs shipping. Best-effort; clears the tracked id either way so the card is
     * never re-deleted.
     */
    public void removeDispatchCard(Order order) {
        removeDispatchCard(order.getDispatchMessageId());
        order.forgetDispatchCard();
    }

    /** Deletes a dispatch card by its message id (best-effort; null = nothing to do). */
    public void removeDispatchCard(Integer messageId) {
        channel.deleteInGroup("removeDispatchCard failed for message " + messageId, messageId);
    }

    // ----- plumbing -----

    private static String adminPath(Order order) {
        return "/orders/" + idStr(order);
    }

    /** The journal row of a message about this order; the summary replaces the text (cards carry phones and addresses). */
    private static ActivityLog.Entry entry(String type, Order order, String summary) {
        return ActivityLog.Entry.bot(type).order(order.getId()).customer(order.getTgUserId()).text(summary);
    }
}
