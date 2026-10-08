package com.maxsolch.shop.tg;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.i18n.ChatPreview;
import com.maxsolch.shop.i18n.CustomerRejectReason;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.payment.ReceiptKind;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.OrderSource;
import com.maxsolch.shop.domain.OrderStatus;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage;
import org.telegram.telegrambots.meta.api.methods.updatingmessages.EditMessageText;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import org.telegram.telegrambots.meta.api.objects.webapp.WebAppInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static com.maxsolch.shop.common.Texts.escHtml;

/**
 * Best-effort Telegram notifications. Every method swallows failures (try/catch + log) so the
 * order/chat transaction never fails because of a bot/network hiccup.
 */
@Slf4j
@Service
public class NotificationService {

    private final ShopBot bot;
    private final AppProperties props;
    private final Messages messages;
    private final SettingsService settings;
    private final CustomerRejectReason customerRejectReason;
    private final ActivityLog activity;

    public NotificationService(@Lazy ShopBot bot, AppProperties props, Messages messages,
                               SettingsService settings, CustomerRejectReason customerRejectReason,
                               ActivityLog activity) {
        this.bot = bot;
        this.props = props;
        this.messages = messages;
        this.settings = settings;
        this.customerRejectReason = customerRejectReason;
        this.activity = activity;
    }

    /**
     * Sends a DM to the order's customer and records it in the «Бот и сайт» journal (delivered, or
     * not and why). The exception is re-thrown for the caller's own handling.
     */
    private Message dm(String type, Order order, SendMessage msg) throws org.telegram.telegrambots.meta.exceptions.TelegramApiException {
        return activity.bot(ActivityLog.Entry.bot(type).toCustomer(order.getTgUserId()).order(order.getId())
                .text(msg.getText()), () -> bot.execute(msg));
    }

    /**
     * Sends a message to the admins' chat and records it. {@code summary} replaces the text in the
     * journal: the seller's cards carry the customer's phone and address, which do not belong there.
     */
    private Message toAdmins(String type, Order order, SendMessage msg, String summary)
            throws org.telegram.telegrambots.meta.exceptions.TelegramApiException {
        return activity.bot(ActivityLog.Entry.bot(type).toAdmins(msg.getChatId()).order(order.getId())
                .customer(order.getTgUserId()).text(summary), () -> bot.execute(msg));
    }

    private boolean enabled() {
        String token = props.getTelegram().getBotToken();
        return token != null && !token.isBlank();
    }

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

    /** Post a fresh order card into the topic for its current status; store chat/thread/message ids. */
    private void postCard(Order order) {
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank()) {
            return;
        }
        SendMessage msg = SendMessage.builder()
                .chatId(chatId)
                .text(buildCard(order))
                .parseMode("HTML")
                .replyMarkup(adminButtons(order))
                .build();
        int topic = topicForStatus(order.getStatus());
        if (topic > 0) {
            msg.setMessageThreadId(topic);
        }
        try {
            Message sent = toAdmins("ADMIN_ORDER_CARD", order, msg,
                    "Карточка заказа #" + shortId(order) + " → тема «" + statusTopicName(order.getStatus()) + "»");
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

    /** New order → post a card into the "New" topic. */
    public void onNewOrder(Order order) {
        if (!enabled()) {
            return;
        }
        postCard(order);
    }

    /** Status changed → MOVE the card: delete from the old topic and re-post into the new one. */
    public void onStatusChanged(Order order) {
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

    /** DM the customer about a status change (only if tg_user_id is present and > 0). */
    public void notifyCustomerStatus(Order order) {
        // Admin switch (Настройки → Уведомления), e.g. while bulk-fixing statuses.
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        if (!settings.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)) {
            activity.record(ActivityLog.Entry.bot("ORDER_STATUS").toCustomer(tgUserId).order(order.getId())
                    .text("Статус " + order.getStatus() + " — уведомления покупателям выключены в настройках")
                    .skipped("NOTIFICATIONS_OFF"));
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String text = customerStatusHeader(order, locale) + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + statusCustomerNote(order, locale);
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build();
            dm("ORDER_STATUS", order, msg);
        } catch (Exception e) {
            log.warn("notifyCustomerStatus failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** DM the customer that an admin added a free gift to their order. */
    public void notifyCustomerGift(Order order, String productTitle, String variantName, int qty) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.gift.title")).append('\n');
            t.append(messages.get(locale, "bot.order")).append(" <b>#").append(shortId(order)).append("</b>\n");
            t.append(messages.get(locale, "bot.gift.body", escHtml(nz(productTitle))));
            if (variantName != null && !variantName.isBlank()) {
                t.append(" <i>(").append(escHtml(variantName)).append(")</i>");
            }
            if (qty > 1) {
                t.append(" × ").append(qty);
            }
            t.append(messages.get(locale, "bot.gift.enjoy"));
            dm("ORDER_GIFT", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerGift failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** DM the customer that an admin applied a discount to their order. */
    public void notifyCustomerDiscount(Order order) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.discount.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.discount.applied",
                            money(order.getDiscountMinor()) + " " + cur) + "\n"
                    + messages.get(locale, "bot.discount.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            dm("ORDER_DISCOUNT", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerDiscount failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** DM the customer that an admin edited their order composition (new total). */
    public void notifyCustomerOrderChanged(Order order) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.changed.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.changed.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            dm("ORDER_CHANGED", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerOrderChanged failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** An admin exchanged goods in the order → DM the customer what goes out instead. */
    public void notifyCustomerExchange(Order order, String givenSummary) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String cur = nz(order.getCurrency());
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.exchange.title")).append('\n');
            t.append(messages.get(locale, "bot.order")).append(" <b>#").append(shortId(order)).append("</b>\n");
            t.append(messages.get(locale, "bot.exchange.body", escHtml(nz(givenSummary)))).append('\n');
            long cod = com.maxsolch.shop.service.OrderQueryService.codMinor(order);
            if (cod > 0) {
                t.append(messages.get(locale, "bot.exchange.toPay", money(cod) + " " + cur)).append('\n');
            }
            t.append(messages.get(locale, "bot.exchange.ttn"));
            dm("ORDER_EXCHANGE", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerExchange failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** The tracking number was corrected after shipping → DM the customer the new one. */
    public void notifyCustomerTracking(Order order) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0 || order.getTrackingNumber() == null) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String text = messages.get(locale, "bot.tracking.changed",
                    shortId(order), escHtml(order.getTrackingNumber()));
            dm("ORDER_TRACKING", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerTracking failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Admin posted a chat message → DM the customer with a deep-link to the order chat. */
    public void onAdminChatMessage(Order order, String preview) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            StringBuilder t = new StringBuilder();
            Locale locale = messages.localeOf(tgUserId);
            t.append(messages.get(locale, "bot.newMessage", shortId(order))).append('\n');
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(escHtml(trim(ChatPreview.localize(preview, locale, messages), 160)))
                        .append("</blockquote>\n");
            }
            t.append(messages.get(locale, "bot.newMessage.cta"));
            SendMessage msg = SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(chatButton(order, locale))
                    .build();
            dm("CHAT_REPLY", order, msg);
        } catch (Exception e) {
            log.warn("onAdminChatMessage failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** Customer posted a chat message → notify admins in the "chat messages" topic with an open button. */
    public void onCustomerChatMessage(Order order, String preview) {
        if (!enabled()) {
            return;
        }
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank()) {
            return;
        }
        try {
            StringBuilder t = new StringBuilder();
            t.append("💬 <b>Новое сообщение от клиента</b>\n");
            t.append("Заказ <b>#").append(shortId(order)).append("</b> · ")
                    .append(escHtml(nz(order.getCustomerName()))).append('\n');
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(escHtml(trim(preview, 200))).append("</blockquote>");
            }
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(t.toString())
                    .parseMode("HTML")
                    .replyMarkup(adminButtons(order))
                    .build();
            int topic = props.getTelegram().getNotifyTopicChat();
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            toAdmins("ADMIN_CHAT_PING", order, msg, "Сообщение покупателя в чате заказа #" + shortId(order));
        } catch (Exception e) {
            log.warn("onCustomerChatMessage failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /**
     * Money arrived online (monobank). Admins get a note in the chat topic — the order still waits
     * for their manual confirmation — and the customer a DM that the payment went through.
     */
    public void onPaymentReceived(Order order, long amountMinor) {
        if (!enabled()) {
            return;
        }
        String cur = nz(order.getCurrency());
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId != null && !chatId.isBlank() && !"0".equals(chatId.trim())) {
            try {
                long cod = Math.max(0, order.getTotalMinor() - Math.min(order.getReceivedMinor(), order.getTotalMinor()));
                String text = "💳 <b>Оплачено онлайн (monobank)</b>\n"
                        + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                        + "Поступило: <b>" + money(amountMinor) + " " + cur + "</b>"
                        + (cod > 0 ? " · наложка <b>" + money(cod) + " " + cur + "</b>" : " · оплачен полностью") + "\n"
                        + "<i>Проверьте наличие и подтвердите заказ. Если товара нет — верните деньги в карточке заказа.</i>";
                SendMessage msg = SendMessage.builder()
                        .chatId(chatId)
                        .text(text)
                        .parseMode("HTML")
                        .replyMarkup(adminButtons(order))
                        .build();
                int topic = props.getTelegram().getNotifyTopicChat();
                if (topic > 0) {
                    msg.setMessageThreadId(topic);
                }
                toAdmins("ADMIN_PAYMENT", order, msg, "Оплачено онлайн по заказу #" + shortId(order) + ": " + money(amountMinor) + " " + cur);
            } catch (Exception e) {
                log.warn("onPaymentReceived (admins) failed for order {}: {}", idStr(order), e.getMessage());
            }
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            String text = messages.get(locale, "bot.paid.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.paid.body", money(amountMinor) + " " + cur);
            dm("PAYMENT_RECEIVED", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(orderButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("onPaymentReceived (customer) failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** How sending a receipt to the customer went. */
    public enum Delivery { SENT, BLOCKED, FAILED }

    /** A bot token is configured: worth preparing anything for the customer's DMs at all. */
    public boolean isBotEnabled() {
        return enabled();
    }

    /**
     * A payment receipt (fiscal check of a sale / refund, or the bank receipt) as a PDF document in
     * the customer's DMs, with the tax-service link and the «open order» button. Unlike the other
     * methods this one reports the outcome, so the caller can record it exactly once.
     */
    public Delivery sendReceipt(Order order, byte[] pdf, ReceiptKind kind, String taxUrl) {
        Long tgUserId = order.getTgUserId();
        if (!enabled() || tgUserId == null || tgUserId <= 0 || pdf == null || pdf.length == 0) {
            return Delivery.FAILED;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            StringBuilder caption = new StringBuilder(messages.get(locale, "bot.receipt." + kind.name(), shortId(order)));
            if (taxUrl != null && isHttps(taxUrl)) {
                caption.append('\n').append("<a href=\"").append(escHtml(taxUrl).replace("\"", "&quot;")).append("\">")
                        .append(messages.get(locale, "bot.receipt.taxLink")).append("</a>");
            }
            SendDocument doc = SendDocument.builder()
                    .chatId(String.valueOf(tgUserId))
                    .document(new InputFile(new java.io.ByteArrayInputStream(pdf), kind.fileName(shortId(order))))
                    .caption(caption.toString())
                    .parseMode("HTML")
                    .replyMarkup(orderButton(order, locale))
                    .build();
            activity.bot(ActivityLog.Entry.bot("RECEIPT").toCustomer(tgUserId).order(order.getId())
                    .text(messages.get(locale, "bot.receipt." + kind.name(), shortId(order)))
                    .detail("kind", kind.name())
                    .detail("file", kind.fileName(shortId(order))), () -> bot.sendDocument(doc));
            return Delivery.SENT;
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
            if (m.contains("blocked") || m.contains("deactivated") || m.contains("chat not found")
                    || m.contains("bot can't initiate")) {
                return Delivery.BLOCKED;
            }
            log.warn("sendReceipt {} failed for order {}: {}", kind, idStr(order), e.getMessage());
            return Delivery.FAILED;
        }
    }

    /** The customer asked to cancel a paid order → admins, in the chat topic, with an open button. */
    public void onCancelRequested(Order order) {
        if (!enabled()) {
            return;
        }
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank() || "0".equals(chatId.trim())) {
            return;
        }
        try {
            String cur = nz(order.getCurrency());
            long received = Math.min(Math.max(0, order.getReceivedMinor()), order.getTotalMinor());
            String text = "🛑 <b>Запрос отмены</b>\n"
                    + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                    + "Оплачено: <b>" + money(received) + " " + cur + "</b>\n"
                    + "<blockquote>" + escHtml(trim(nz(order.getCancelRequestReason()), 300)) + "</blockquote>\n"
                    + "<i>Одобрите (отмена + возврат денег на карту) или отклоните в карточке заказа.</i>";
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(adminButtons(order))
                    .build();
            int topic = props.getTelegram().getNotifyTopicChat();
            if (topic > 0) {
                msg.setMessageThreadId(topic);
            }
            toAdmins("ADMIN_CANCEL_REQUEST", order, msg, "Запрос отмены заказа #" + shortId(order));
        } catch (Exception e) {
            log.warn("onCancelRequested failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /** The admin answered the customer's cancellation request → DM the customer in their language. */
    public void notifyCustomerCancelRequest(Order order, boolean approved) {
        if (!enabled()) {
            return;
        }
        Long tgUserId = order.getTgUserId();
        if (tgUserId == null || tgUserId <= 0) {
            return;
        }
        try {
            Locale locale = messages.localeOf(tgUserId);
            long received = Math.min(Math.max(0, order.getReceivedMinor()), order.getTotalMinor());
            String text = approved
                    ? messages.get(locale, "bot.cancelRequest.approved", shortId(order),
                            money(received) + " " + nz(order.getCurrency()))
                    : messages.get(locale, "bot.cancelRequest.declined", shortId(order),
                            escHtml(nz(order.getCancelRequestAdminComment())));
            dm(approved ? "CANCEL_REQUEST_APPROVED" : "CANCEL_REQUEST_DECLINED", order, SendMessage.builder()
                    .chatId(String.valueOf(tgUserId))
                    .text(text)
                    .parseMode("HTML")
                    .replyMarkup(approved ? orderButton(order, locale) : chatButton(order, locale))
                    .build());
        } catch (Exception e) {
            log.warn("notifyCustomerCancelRequest failed for order {}: {}", idStr(order), e.getMessage());
        }
    }

    /**
     * Post a dispatch card to the seller's "Отправка" topic and remember its message id on the
     * order, so it can later be removed when the order ships. Idempotent: if the order already has
     * a tracked dispatch card we do nothing (avoids duplicates from re-runs / the sync button).
     * The id is stored on the managed entity and flushed by the caller's transaction.
     * Returns {@code true} if a new card was actually posted.
     */
    public boolean postDispatchCard(Order order) {
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank() || order.getDispatchMessageId() != null) {
            return false;
        }
        try {
            SendMessage msg = SendMessage.builder()
                    .chatId(chatId)
                    .text(buildDispatchCard(order))
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
        String chatId = props.getTelegram().getNotifyChatId();
        if (chatId == null || chatId.isBlank()) {
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
                    .text(buildDispatchCard(order))
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
        String chatId = props.getTelegram().getNotifyChatId();
        if (messageId == null || chatId == null || chatId.isBlank()) {
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

    /** Seller-facing dispatch card: address, items, and the exact COD (наложка) to set. */
    private String buildDispatchCard(Order order) {
        String cur = nz(order.getCurrency());
        long received = OrderQueryService.receivedMinor(order);
        long cod = OrderQueryService.codMinor(order);
        StringBuilder sb = new StringBuilder();
        sb.append("📦 <b>К ОТПРАВКЕ</b> · #").append(shortId(order)).append('\n');
        sb.append("➖➖➖➖➖➖➖➖➖➖\n");
        sb.append("👤 ").append(escHtml(nz(order.getCustomerName()))).append('\n');
        sb.append("📞 ").append(escHtml(nz(order.getPhone()))).append('\n');
        sb.append("🚚 ").append(deliveryLabel(order)).append('\n');
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            sb.append("\n<b>🛒 Отправить:</b>\n");
            for (OrderItem it : order.getItems()) {
                sb.append(it.isGift() ? "• 🎁 " : "• ").append(escHtml(it.getTitleSnapshot()));
                if (it.getVariantNameSnapshot() != null) {
                    sb.append(" <i>(").append(escHtml(it.getVariantNameSnapshot())).append(")</i>");
                }
                sb.append(" × ").append(it.getQuantity());
                if (it.isGift()) {
                    sb.append(" <i>(подарок)</i>");
                }
                sb.append('\n');
            }
        }
        sb.append("\n💰 Сумма заказа: <b>").append(money(order.getTotalMinor())).append(' ').append(cur).append("</b>\n");
        if (order.getPaymentOptionTitle() != null) {
            sb.append("💳 ").append(escHtml(order.getPaymentOptionTitle())).append('\n');
        }
        if (received > 0) {
            sb.append("✅ Уже оплачено: ").append(money(received)).append(' ').append(cur).append('\n');
        }
        if (cod <= 0) {
            sb.append("\n🟢 <b>НАЛОЖКА: 0</b> — заказ оплачен, отправляем без наложенного платежа.");
        } else if (received > 0) {
            sb.append("\n🟡 <b>НАЛОЖКА (взять при выдаче): ").append(money(cod)).append(' ').append(cur).append("</b>\n")
                    .append("<i>(сумма ").append(money(order.getTotalMinor()))
                    .append(" − предоплата ").append(money(received)).append(")</i>");
        } else {
            sb.append("\n🔴 <b>НАЛОЖКА (взять при выдаче): ").append(money(cod)).append(' ').append(cur)
                    .append("</b> — не оплачено.");
        }
        return sb.toString();
    }

    // ----- helpers -----

    /** Telegram only accepts HTTPS URLs in inline buttons (and rejects localhost). */
    private static boolean isHttps(String url) {
        return url != null && url.startsWith("https://");
    }

    private InlineKeyboardMarkup adminButtons(Order order) {
        String adminBase = props.getAdminBaseUrl();
        // Skip buttons until a public HTTPS admin URL is configured (local http://localhost is
        // rejected by Telegram and would fail the whole message send).
        if (!isHttps(adminBase)) {
            return null;
        }
        InlineKeyboardButton open = InlineKeyboardButton.builder()
                .text("🔎 Открыть в админке")
                .url(adminBase + "/orders/" + idStr(order))
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(open))).build();
    }

    /** Opens the order page itself in the Mini App (deep link view_<id>). */
    private InlineKeyboardMarkup orderButton(Order order, Locale locale) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(messages.get(locale, "bot.openOrder"))
                .webApp(WebAppInfo.builder().url(webapp + "?startapp=view_" + idStr(order)).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    private InlineKeyboardMarkup chatButton(Order order, Locale locale) {
        String webapp = props.getWebappBaseUrl();
        if (!isHttps(webapp)) {
            return null;
        }
        InlineKeyboardButton btn = InlineKeyboardButton.builder()
                .text(messages.get(locale, "bot.openChat"))
                .webApp(WebAppInfo.builder().url(webapp + "?startapp=order_" + idStr(order)).build())
                .build();
        return InlineKeyboardMarkup.builder().keyboard(List.of(List.of(btn))).build();
    }

    /** Nicely formatted HTML order card (Telegram parse_mode=HTML). */
    private String buildCard(Order order) {
        String cur = nz(order.getCurrency());
        StringBuilder sb = new StringBuilder();
        sb.append(statusHeader(order)).append('\n');
        sb.append("<b>🧾 Заказ #").append(shortId(order)).append("</b>\n");
        if (order.getSource() == OrderSource.WEB) {
            sb.append("🌐 Сайт\n");
        }
        sb.append("➖➖➖➖➖➖➖➖➖➖\n");
        // customer
        sb.append("👤 ").append(escHtml(nz(order.getCustomerName()))).append('\n');
        sb.append("📞 ").append(escHtml(nz(order.getPhone()))).append('\n');
        if (order.getTgUsername() != null && !order.getTgUsername().isBlank()) {
            sb.append("✈️ @").append(escHtml(order.getTgUsername().replace("@", ""))).append('\n');
        }
        // items
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            sb.append("\n<b>🛒 Состав</b>\n");
            for (OrderItem it : order.getItems()) {
                sb.append("• ").append(escHtml(it.getTitleSnapshot()));
                if (it.getVariantNameSnapshot() != null) {
                    sb.append(" <i>(").append(escHtml(it.getVariantNameSnapshot())).append(")</i>");
                }
                long line = it.getPriceMinorSnapshot() * (long) it.getQuantity();
                sb.append(" × ").append(it.getQuantity())
                        .append(" — ").append(money(line)).append(' ').append(cur).append('\n');
            }
        }
        // totals
        sb.append("\n💰 <b>Итого: ").append(money(order.getTotalMinor())).append(' ').append(cur).append("</b>");
        if (order.getDiscountMinor() > 0) {
            sb.append(" <i>(скидка ").append(money(order.getDiscountMinor())).append(' ').append(cur).append(")</i>");
        }
        sb.append('\n');
        if (order.getPaymentOptionTitle() != null) {
            sb.append("💳 ").append(escHtml(order.getPaymentOptionTitle())).append('\n');
        }
        sb.append("🚚 ").append(deliveryLabel(order)).append('\n');
        if (order.getComment() != null && !order.getComment().isBlank()) {
            sb.append("📝 ").append(escHtml(order.getComment())).append('\n');
        }
        if (order.getTrackingNumber() != null && !order.getTrackingNumber().isBlank()) {
            sb.append("📦 ТТН: <code>").append(escHtml(order.getTrackingNumber())).append("</code>\n");
        }
        if (order.getRejectReason() != null && !order.getRejectReason().isBlank()) {
            sb.append("\n❌ <b>Причина отклонения:</b> ").append(escHtml(order.getRejectReason())).append('\n');
        }
        return sb.toString();
    }

    /** Name of the seller's forum topic a card of this status goes to (for the journal). */
    private static String statusTopicName(OrderStatus status) {
        if (status == null) {
            return "Новые";
        }
        return switch (status) {
            case NEW -> "Новые";
            case APPROVED -> "В работе";
            case SHIPPED -> "Высланы";
            case DELIVERED -> "Закрытые";
            case REJECTED -> "Отклонённые";
        };
    }

    private String statusHeader(Order order) {
        OrderStatus s = order.getStatus();
        if (s == null) {
            return "<b>Заказ</b>";
        }
        return switch (s) {
            case NEW -> "🆕 <b>Новый заказ</b>";
            case APPROVED -> "✅ <b>Одобрен</b>";
            case SHIPPED -> "📦 <b>Выслан</b>";
            case DELIVERED -> "🎉 <b>Доставлен</b>";
            case REJECTED -> "❌ <b>Отклонён</b>";
        };
    }

    /**
     * Short customer-facing note per status, in the CUSTOMER's language.
     *
     * <p>The rejection reason itself is passed through as the admin typed it: it is a free-text
     * explanation written by a person, and machine-mangling it would be worse than leaving it.
     */
    private String statusCustomerNote(Order order, Locale locale) {
        OrderStatus s = order.getStatus();
        if (s == null) {
            return "";
        }
        return switch (s) {
            case APPROVED -> messages.get(locale, "bot.note.APPROVED");
            case SHIPPED -> order.getTrackingNumber() != null
                    ? messages.get(locale, "bot.note.SHIPPED.tracking", escHtml(order.getTrackingNumber()))
                    : messages.get(locale, "bot.note.SHIPPED");
            case DELIVERED -> messages.get(locale, "bot.note.DELIVERED");
            case REJECTED -> order.getRejectReason() != null
                    ? messages.get(locale, "bot.note.REJECTED.reason",
                            escHtml(customerRejectReason.localize(order.getRejectReason(), locale)))
                    : messages.get(locale, "bot.note.REJECTED");
            default -> "";
        };
    }

    /** The same header as the seller's card, but in the customer's language. */
    private String customerStatusHeader(Order order, Locale locale) {
        OrderStatus s = order.getStatus();
        return s == null
                ? "<b>" + messages.get(locale, "bot.order") + "</b>"
                : messages.get(locale, "bot.status." + s.name());
    }

    private String deliveryLabel(Order order) {
        if (order.getDeliveryMethod() == DeliveryMethod.PICKUP) {
            return "Самовывоз";
        }
        StringBuilder d = new StringBuilder("Новая Почта");
        if (order.getNpCityName() != null) {
            d.append(" — ").append(escHtml(order.getNpCityName()));
            if (order.getNpWarehouseName() != null) {
                d.append(", ").append(escHtml(order.getNpWarehouseName()));
            }
        }
        return d.toString();
    }

    /**
     * Minor units → whole currency units, rounded the same way the frontends do
     * (lib/money.ts uses Math.round). Truncating here made a Telegram card and the app show
     * different totals for the same order whenever kopecks were involved.
     */
    private String money(long minor) {
        return com.maxsolch.shop.common.MoneyFormat.amount(minor);
    }

    private String nz(String s) {
        return s == null ? "" : s;
    }

    private String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    private String idStr(Order order) {
        return UuidUtil.toString(order.getId());
    }

    private String shortId(Order order) {
        String id = idStr(order);
        return id == null ? "?" : id.substring(0, 8);
    }
}
