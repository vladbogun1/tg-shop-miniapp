package com.maxsolch.shop.tg;

import com.maxsolch.shop.analytics.AnalyticsZone;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderMoney;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.i18n.ChatPreview;
import com.maxsolch.shop.i18n.CustomerRejectReason;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.payment.ReceiptKind;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.objects.InputFile;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import static com.maxsolch.shop.common.Texts.escHtml;
import static com.maxsolch.shop.tg.TgFormat.idStr;
import static com.maxsolch.shop.tg.TgFormat.isHttps;
import static com.maxsolch.shop.tg.TgFormat.money;
import static com.maxsolch.shop.tg.TgFormat.nz;
import static com.maxsolch.shop.tg.TgFormat.shortId;
import static com.maxsolch.shop.tg.TgFormat.trim;

/**
 * Every Telegram notification of an order, as one facade for OrderService, the jobs and the order event
 * listener. It decides WHAT is said (the customer's texts come from the bundle, the seller's are Russian
 * strings); the sending is {@link CustomerBot} (DMs to the buyer) and {@link SellerChannel} (the admins'
 * group). Every method is best-effort: a Telegram failure is logged and swallowed, so the order/chat
 * transaction never fails because of a bot/network hiccup.
 */
@Slf4j
@Service
public class NotificationService {

    private final AppProperties props;
    private final Messages messages;
    private final SettingsService settings;
    private final CustomerRejectReason customerRejectReason;
    private final CustomerBot customerBot;
    private final SellerChannel sellerChannel;

    public NotificationService(AppProperties props, Messages messages, SettingsService settings,
                               CustomerRejectReason customerRejectReason, CustomerBot customerBot,
                               SellerChannel sellerChannel) {
        this.props = props;
        this.messages = messages;
        this.settings = settings;
        this.customerRejectReason = customerRejectReason;
        this.customerBot = customerBot;
        this.sellerChannel = sellerChannel;
    }

    /** New order → post a card into the "New" topic. */
    public void onNewOrder(Order order) {
        sellerChannel.postOrderCard(order);
    }

    /** Status changed → MOVE the card: delete from the old topic and re-post into the new one. */
    public void onStatusChanged(Order order) {
        sellerChannel.moveOrderCard(order);
    }

    /** DM the customer about a status change (only if tg_user_id is present and > 0). */
    public void notifyCustomerStatus(Order order) {
        // Admin switch (Настройки → Уведомления), e.g. while bulk-fixing statuses.
        if (!customerBot.canReach(order)) {
            return;
        }
        if (!settings.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)) {
            customerBot.skipped(order, "ORDER_STATUS",
                    "Статус " + order.getStatus() + " — уведомления покупателям выключены в настройках",
                    "NOTIFICATIONS_OFF");
            return;
        }
        customerBot.send("notifyCustomerStatus", "ORDER_STATUS", order, locale -> {
            String text = customerStatusHeader(order, locale) + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + statusCustomerNote(order, locale);
            if ("SEALED".equals(order.getGiftCaseStatus()) && order.getStatus() != OrderStatus.REJECTED) {
                // The gift case waits in the order until the customer opens it in the shop.
                text += (text.endsWith("\n") ? "" : "\n") + messages.get(locale, OrderService.giftCaseOpenable(order)
                        ? "bot.giftCase.grantedOpen" : "bot.giftCase.sealed");
            }
            return new CustomerBot.Dm(text, customerBot.chatButton(order, locale));
        });
    }

    /** DM the customer that an admin added a free gift to their order. */
    public void notifyCustomerGift(Order order, String productTitle, String variantName, int qty) {
        customerBot.send("notifyCustomerGift", "ORDER_GIFT", order, locale -> {
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
            return new CustomerBot.Dm(t.toString(), customerBot.chatButton(order, locale));
        });
    }

    /** DM the customer that an admin gave them a gift case (no prize name — it is a surprise). */
    public void notifyCustomerGiftCase(Order order) {
        customerBot.send("notifyCustomerGiftCase", "ORDER_GIFT_CASE", order, locale -> {
            String text = messages.get(locale, "bot.giftCase.grantedTitle") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, OrderService.giftCaseOpenable(order)
                            ? "bot.giftCase.grantedOpen" : "bot.giftCase.grantedAfterPay");
            return new CustomerBot.Dm(text, customerBot.chatButton(order, locale));
        });
    }

    /**
     * DM the customer the promo code a discount prize of their gift case just gave: the code, the
     * discount, how long it lasts, and a button to the cart (where the code is offered as «Приз із
     * кейса»). Only customers who have a Telegram chat with the bot; the caller sends it once.
     */
    public void notifyCustomerCasePromo(Order order, String code, int percent, long amountMinor,
                                        Instant expiresAt) {
        if (code == null || code.isBlank()) {
            return;
        }
        customerBot.send("notifyCustomerCasePromo", "ORDER_CASE_PROMO", order, locale -> {
            String discount = percent > 0 ? "−" + percent + "%" : "−" + money(amountMinor) + " " + nz(order.getCurrency());
            String text = messages.get(locale, "bot.giftCase.promoTitle") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.giftCase.promoBody", discount, escHtml(code)) + "\n"
                    + (expiresAt == null ? "" : messages.get(locale, "bot.giftCase.promoUntil",
                            expiresAt.atZone(AnalyticsZone.of(props)).format(DAY)) + "\n")
                    + messages.get(locale, "bot.giftCase.promoHint");
            return new CustomerBot.Dm(text, customerBot.cartButton(locale));
        });
    }

    /**
     * "Your code from the case runs out on …" (GiftCasePromoReminderJob): once per code, to the order's
     * chat, with the cart button — at checkout the code is offered as «Подарунок із кейса».
     *
     * @return whether the message went out
     */
    public boolean notifyCustomerCasePromoExpiring(Order order, String code, int percent, long amountMinor,
                                                   Instant expiresAt) {
        if (code == null || code.isBlank() || expiresAt == null) {
            return false;
        }
        return customerBot.send("notifyCustomerCasePromoExpiring", "ORDER_CASE_PROMO_EXPIRING", order, locale -> {
            String discount = percent > 0 ? "−" + percent + "%" : "−" + money(amountMinor) + " " + nz(order.getCurrency());
            String text = messages.get(locale, "bot.giftCase.promoExpiringTitle", discount) + "\n"
                    + messages.get(locale, "bot.giftCase.promoExpiringBody", "<code>" + escHtml(code) + "</code>",
                            expiresAt.atZone(AnalyticsZone.of(props)).format(DAY)) + "\n"
                    + messages.get(locale, "bot.giftCase.promoHint");
            return new CustomerBot.Dm(text, customerBot.cartButton(locale));
        });
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    /** DM the customer that an admin applied a discount to their order. */
    public void notifyCustomerDiscount(Order order) {
        customerBot.send("notifyCustomerDiscount", "ORDER_DISCOUNT", order, locale -> {
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.discount.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.discount.applied",
                            money(order.getDiscountMinor()) + " " + cur) + "\n"
                    + messages.get(locale, "bot.discount.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            return new CustomerBot.Dm(text, customerBot.chatButton(order, locale));
        });
    }

    /** DM the customer that an admin edited their order composition (new total). */
    public void notifyCustomerOrderChanged(Order order) {
        customerBot.send("notifyCustomerOrderChanged", "ORDER_CHANGED", order, locale -> {
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.changed.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.changed.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            return new CustomerBot.Dm(text, customerBot.chatButton(order, locale));
        });
    }

    /** An admin exchanged goods in the order → DM the customer what goes out instead. */
    public void notifyCustomerExchange(Order order, String givenSummary) {
        customerBot.send("notifyCustomerExchange", "ORDER_EXCHANGE", order, locale -> {
            String cur = nz(order.getCurrency());
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.exchange.title")).append('\n');
            t.append(messages.get(locale, "bot.order")).append(" <b>#").append(shortId(order)).append("</b>\n");
            if (order.getExchangeOfOrderId() != null) {
                t.append(messages.get(locale, "bot.exchange.ofOrder",
                        com.maxsolch.shop.common.UuidUtil.toString(order.getExchangeOfOrderId()).substring(0, 8))).append('\n');
            }
            t.append(messages.get(locale, "bot.exchange.body", escHtml(nz(givenSummary)))).append('\n');
            long cod = OrderMoney.codMinor(order);
            // A replacement order: the difference is paid online in the order or наложкой — their choice.
            boolean payChoice = order.getExchangeOfOrderId() != null
                    && OrderMoney.amountDueMinor(order) > 0;
            if (payChoice) {
                t.append(messages.get(locale, "bot.exchange.payChoice", money(cod) + " " + cur)).append('\n');
            } else if (cod > 0) {
                t.append(messages.get(locale, "bot.exchange.toPay", money(cod) + " " + cur)).append('\n');
            }
            t.append(messages.get(locale, "bot.exchange.ttn"));
            return new CustomerBot.Dm(t.toString(), payChoice
                    ? customerBot.orderButton(order, locale) : customerBot.chatButton(order, locale));
        });
    }

    /** Two orders of the customer became one (V71) → DM what goes in the parcel and what is left to pay. */
    public void notifyCustomerMerged(Order order, String mergedShortId) {
        customerBot.send("notifyCustomerMerged", "ORDER_MERGE", order, locale -> {
            String cur = nz(order.getCurrency());
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.merge.title")).append('\n');
            t.append(messages.get(locale, "bot.merge.body", mergedShortId, shortId(order))).append('\n');
            long due = OrderMoney.amountDueMinor(order);
            long cod = OrderMoney.codMinor(order);
            if (order.isPaid() && due > 0) {
                t.append(messages.get(locale, "bot.merge.payChoice", money(due) + " " + cur));
            } else if (due > 0) {
                t.append(messages.get(locale, "bot.merge.payOnline", money(due) + " " + cur));
            } else if (cod > 0) {
                t.append(messages.get(locale, "bot.merge.toPay", money(cod) + " " + cur));
            } else {
                t.append(messages.get(locale, "bot.merge.paid"));
            }
            return new CustomerBot.Dm(t.toString(), customerBot.orderButton(order, locale));
        });
    }

    /** A return was registered (V68) → DM the customer what came back and what is refunded. */
    public void notifyCustomerReturn(Order order, String itemsSummary, long refundMinor) {
        customerBot.send("notifyCustomerReturn", "ORDER_RETURN", order, locale -> {
            String cur = nz(order.getCurrency());
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.return.title")).append('\n');
            t.append(messages.get(locale, "bot.order")).append(" <b>#").append(shortId(order)).append("</b>\n");
            if (itemsSummary != null && !itemsSummary.isBlank()) {
                t.append(messages.get(locale, "bot.return.items", escHtml(itemsSummary))).append('\n');
            }
            if (refundMinor > 0) {
                t.append(messages.get(locale, "bot.return.refund", money(refundMinor) + " " + cur)).append('\n');
            }
            t.append(messages.get(locale, "bot.return.questions"));
            return new CustomerBot.Dm(t.toString(), customerBot.chatButton(order, locale));
        });
    }

    /** The tracking number was corrected after shipping → DM the customer the new one. */
    public void notifyCustomerTracking(Order order) {
        if (order.getTrackingNumber() == null) {
            return;
        }
        customerBot.send("notifyCustomerTracking", "ORDER_TRACKING", order, locale -> {
            String text = messages.get(locale, "bot.tracking.changed",
                    shortId(order), escHtml(order.getTrackingNumber()));
            return new CustomerBot.Dm(text, customerBot.chatButton(order, locale));
        });
    }

    /** Admin posted a chat message → DM the customer with a deep-link to the order chat. */
    public void onAdminChatMessage(Order order, String preview) {
        customerBot.send("onAdminChatMessage", "CHAT_REPLY", order, locale -> {
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.newMessage", shortId(order))).append('\n');
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(escHtml(trim(ChatPreview.localize(preview, locale, messages), 160)))
                        .append("</blockquote>\n");
            }
            t.append(messages.get(locale, "bot.newMessage.cta"));
            return new CustomerBot.Dm(t.toString(), customerBot.chatButton(order, locale));
        });
    }

    /** Customer posted a chat message → notify admins in the "chat messages" topic with an open button. */
    public void onCustomerChatMessage(Order order, String preview) {
        sellerChannel.pingChatTopic("onCustomerChatMessage", "ADMIN_CHAT_PING", order,
                "Сообщение покупателя в чате заказа #" + shortId(order), () -> {
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
     * Money arrived online (monobank). Admins get a note in the chat topic — the order still waits
     * for their manual confirmation — and the customer a DM that the payment went through.
     */
    public void onPaymentReceived(Order order, long amountMinor) {
        String cur = nz(order.getCurrency());
        sellerChannel.pingChatTopicUnlessZero("onPaymentReceived (admins)", "ADMIN_PAYMENT", order,
                "Оплачено онлайн по заказу #" + shortId(order) + ": " + money(amountMinor) + " " + cur, () -> {
                    long cod = Math.max(0, order.getTotalMinor() - Math.min(order.getReceivedMinor(), order.getTotalMinor()));
                    return "💳 <b>Оплачено онлайн (monobank)</b>\n"
                            + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                            + "Поступило: <b>" + money(amountMinor) + " " + cur + "</b>"
                            + (cod > 0 ? " · наложка <b>" + money(cod) + " " + cur + "</b>" : " · оплачен полностью") + "\n"
                            + "<i>Проверьте наличие и подтвердите заказ. Если товара нет — верните деньги в карточке заказа.</i>";
                });
        customerBot.send("onPaymentReceived (customer)", "PAYMENT_RECEIVED", order, locale -> {
            String text = messages.get(locale, "bot.paid.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.paid.body", money(amountMinor) + " " + cur);
            return new CustomerBot.Dm(text, customerBot.orderButton(order, locale));
        });
    }

    /** How sending a receipt to the customer went. */
    public enum Delivery { SENT, BLOCKED, FAILED }

    /** A bot token is configured: worth preparing anything for the customer's DMs at all. */
    public boolean isBotEnabled() {
        return customerBot.enabled();
    }

    /**
     * A payment receipt (fiscal check of a sale / refund, or the bank receipt) as a PDF document in
     * the customer's DMs, with the tax-service link and the «open order» button. Unlike the other
     * methods this one reports the outcome, so the caller can record it exactly once.
     */
    public Delivery sendReceipt(Order order, byte[] pdf, ReceiptKind kind, String taxUrl) {
        if (!customerBot.canReach(order) || pdf == null || pdf.length == 0) {
            return Delivery.FAILED;
        }
        try {
            Locale locale = customerBot.localeOf(order);
            StringBuilder caption = new StringBuilder(messages.get(locale, "bot.receipt." + kind.name(), shortId(order)));
            if (taxUrl != null && isHttps(taxUrl)) {
                caption.append('\n').append("<a href=\"").append(escHtml(taxUrl).replace("\"", "&quot;")).append("\">")
                        .append(messages.get(locale, "bot.receipt.taxLink")).append("</a>");
            }
            SendDocument doc = SendDocument.builder()
                    .chatId(String.valueOf(order.getTgUserId()))
                    .document(new InputFile(new java.io.ByteArrayInputStream(pdf), kind.fileName(shortId(order))))
                    .caption(caption.toString())
                    .parseMode("HTML")
                    .replyMarkup(customerBot.orderButton(order, locale))
                    .build();
            customerBot.sendDocument(doc, customerBot.journal("RECEIPT", order)
                    .text(messages.get(locale, "bot.receipt." + kind.name(), shortId(order)))
                    .detail("kind", kind.name())
                    .detail("file", kind.fileName(shortId(order))));
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
        sellerChannel.pingChatTopicUnlessZero("onCancelRequested", "ADMIN_CANCEL_REQUEST", order,
                "Запрос отмены заказа #" + shortId(order), () -> {
                    String cur = nz(order.getCurrency());
                    long received = Math.min(Math.max(0, order.getReceivedMinor()), order.getTotalMinor());
                    return "🛑 <b>Запрос отмены</b>\n"
                            + "Заказ <b>#" + shortId(order) + "</b> · " + escHtml(nz(order.getCustomerName())) + "\n"
                            + "Оплачено: <b>" + money(received) + " " + cur + "</b>\n"
                            + "<blockquote>" + escHtml(trim(nz(order.getCancelRequestReason()), 300)) + "</blockquote>\n"
                            + "<i>Одобрите (отмена + возврат денег на карту) или отклоните в карточке заказа.</i>";
                });
    }

    /** The admin answered the customer's cancellation request → DM the customer in their language. */
    public void notifyCustomerCancelRequest(Order order, boolean approved) {
        String journalType = approved ? "CANCEL_REQUEST_APPROVED" : "CANCEL_REQUEST_DECLINED";
        customerBot.send("notifyCustomerCancelRequest", journalType, order, locale -> {
            long received = Math.min(Math.max(0, order.getReceivedMinor()), order.getTotalMinor());
            String text = approved
                    ? messages.get(locale, "bot.cancelRequest.approved", shortId(order),
                            money(received) + " " + nz(order.getCurrency()))
                    : messages.get(locale, "bot.cancelRequest.declined", shortId(order),
                            escHtml(nz(order.getCancelRequestAdminComment())));
            return new CustomerBot.Dm(text, approved
                    ? customerBot.orderButton(order, locale) : customerBot.chatButton(order, locale));
        });
    }

    /** The seller's «К ОТПРАВКЕ» card: posted once per order, see {@link SellerChannel#postDispatchCard}. */
    public boolean postDispatchCard(Order order) {
        return sellerChannel.postDispatchCard(order);
    }

    /** Reconciles the dispatch card with Telegram (edit in place, re-post if deleted by hand). */
    public boolean syncDispatchCard(Order order) {
        return sellerChannel.syncDispatchCard(order);
    }

    /** Removes the dispatch card once the order leaves APPROVED and forgets its id. */
    public void removeDispatchCard(Order order) {
        sellerChannel.removeDispatchCard(order);
    }

    /** Deletes a dispatch card by its message id (best-effort; null = nothing to do). */
    public void removeDispatchCard(Integer messageId) {
        sellerChannel.removeDispatchCard(messageId);
    }

    // ----- helpers -----

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
}
