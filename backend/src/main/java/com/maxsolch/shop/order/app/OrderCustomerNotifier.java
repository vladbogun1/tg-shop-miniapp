package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.notification.app.CustomerBot;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.i18n.ChatPreview;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.function.Function;

import static com.maxsolch.shop.notification.app.TgFormat.money;
import static com.maxsolch.shop.notification.app.TgFormat.nz;
import static com.maxsolch.shop.notification.app.TgFormat.trim;
import static com.maxsolch.shop.order.app.OrderTg.idStr;
import static com.maxsolch.shop.order.app.OrderTg.shortId;
import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * What the order tells the customer in the bot: one method per event, each deciding WHAT is said (the texts come
 * from the bundle, in the customer's language). The sending, the language, the journal and the «no chat, no
 * message» rule are {@link CustomerBot}. Every method is best-effort: a Telegram failure is logged and swallowed,
 * so the order/chat transaction never fails because of a bot hiccup. The seller's half is
 * {@link OrderSellerNotifier}.
 */
@Slf4j
@Component
public class OrderCustomerNotifier {

    private final ShopZone shopZone;
    private final Messages messages;
    private final SettingsService settings;
    private final CustomerRejectReason customerRejectReason;
    private final CustomerBot customerBot;

    public OrderCustomerNotifier(ShopZone shopZone, Messages messages, SettingsService settings,
                                 CustomerRejectReason customerRejectReason, CustomerBot customerBot) {
        this.shopZone = shopZone;
        this.messages = messages;
        this.settings = settings;
        this.customerRejectReason = customerRejectReason;
        this.customerBot = customerBot;
    }

    /** DM the customer about a status change (only if tg_user_id is present and > 0). */
    public void notifyCustomerStatus(Order order) {
        // Admin switch (Настройки → Уведомления), e.g. while bulk-fixing statuses.
        if (!canReach(order)) {
            return;
        }
        if (!settings.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)) {
            skipped(order, "ORDER_STATUS",
                    "Статус " + order.getStatus() + " — уведомления покупателям выключены в настройках",
                    "NOTIFICATIONS_OFF");
            return;
        }
        send("notifyCustomerStatus", "ORDER_STATUS", order, locale -> {
            String text = customerStatusHeader(order, locale) + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + statusCustomerNote(order, locale);
            if ("SEALED".equals(order.getGiftCaseStatus()) && order.getStatus() != OrderStatus.REJECTED) {
                // The gift case waits in the order until the customer opens it in the shop.
                text += (text.endsWith("\n") ? "" : "\n") + messages.get(locale, GiftCaseRules.giftCaseOpenable(order)
                        ? "bot.giftCase.grantedOpen" : "bot.giftCase.sealed");
            }
            return new CustomerBot.Dm(text, chatButton(order, locale));
        });
    }

    /** DM the customer that an admin added a free gift to their order. */
    public void notifyCustomerGift(Order order, String productTitle, String variantName, int qty) {
        send("notifyCustomerGift", "ORDER_GIFT", order, locale -> {
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
            return new CustomerBot.Dm(t.toString(), chatButton(order, locale));
        });
    }

    /** DM the customer that an admin gave them a gift case (no prize name — it is a surprise). */
    public void notifyCustomerGiftCase(Order order) {
        send("notifyCustomerGiftCase", "ORDER_GIFT_CASE", order, locale -> {
            String text = messages.get(locale, "bot.giftCase.grantedTitle") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, GiftCaseRules.giftCaseOpenable(order)
                            ? "bot.giftCase.grantedOpen" : "bot.giftCase.grantedAfterPay");
            return new CustomerBot.Dm(text, chatButton(order, locale));
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
        send("notifyCustomerCasePromo", "ORDER_CASE_PROMO", order, locale -> {
            String discount = percent > 0 ? "−" + percent + "%" : "−" + money(amountMinor) + " " + nz(order.getCurrency());
            String text = messages.get(locale, "bot.giftCase.promoTitle") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.giftCase.promoBody", discount, escHtml(code)) + "\n"
                    + (expiresAt == null ? "" : messages.get(locale, "bot.giftCase.promoUntil",
                            expiresAt.atZone(shopZone.zone()).format(DAY)) + "\n")
                    + messages.get(locale, "bot.giftCase.promoHint");
            return new CustomerBot.Dm(text, cartButton(locale));
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
        return send("notifyCustomerCasePromoExpiring", "ORDER_CASE_PROMO_EXPIRING", order, locale -> {
            String discount = percent > 0 ? "−" + percent + "%" : "−" + money(amountMinor) + " " + nz(order.getCurrency());
            String text = messages.get(locale, "bot.giftCase.promoExpiringTitle", discount) + "\n"
                    + messages.get(locale, "bot.giftCase.promoExpiringBody", "<code>" + escHtml(code) + "</code>",
                            expiresAt.atZone(shopZone.zone()).format(DAY)) + "\n"
                    + messages.get(locale, "bot.giftCase.promoHint");
            return new CustomerBot.Dm(text, cartButton(locale));
        });
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    /** DM the customer that an admin applied a discount to their order. */
    public void notifyCustomerDiscount(Order order) {
        send("notifyCustomerDiscount", "ORDER_DISCOUNT", order, locale -> {
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.discount.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.discount.applied",
                            money(order.getDiscountMinor()) + " " + cur) + "\n"
                    + messages.get(locale, "bot.discount.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            return new CustomerBot.Dm(text, chatButton(order, locale));
        });
    }

    /** DM the customer that an admin edited their order composition (new total). */
    public void notifyCustomerOrderChanged(Order order) {
        send("notifyCustomerOrderChanged", "ORDER_CHANGED", order, locale -> {
            String cur = nz(order.getCurrency());
            String text = messages.get(locale, "bot.changed.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.changed.newTotal",
                            money(order.getTotalMinor()) + " " + cur);
            return new CustomerBot.Dm(text, chatButton(order, locale));
        });
    }

    /** An admin exchanged goods in the order → DM the customer what goes out instead. */
    public void notifyCustomerExchange(Order order, String givenSummary) {
        send("notifyCustomerExchange", "ORDER_EXCHANGE", order, locale -> {
            String cur = nz(order.getCurrency());
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.exchange.title")).append('\n');
            t.append(messages.get(locale, "bot.order")).append(" <b>#").append(shortId(order)).append("</b>\n");
            if (order.getExchangeOfOrderId() != null) {
                t.append(messages.get(locale, "bot.exchange.ofOrder",
                        com.maxsolch.shop.platform.util.UuidUtil.toString(order.getExchangeOfOrderId()).substring(0, 8))).append('\n');
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
                    ? orderButton(order, locale) : chatButton(order, locale));
        });
    }

    /** Two orders of the customer became one (V71) → DM what goes in the parcel and what is left to pay. */
    public void notifyCustomerMerged(Order order, String mergedShortId) {
        send("notifyCustomerMerged", "ORDER_MERGE", order, locale -> {
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
            return new CustomerBot.Dm(t.toString(), orderButton(order, locale));
        });
    }

    /** A return was registered (V68) → DM the customer what came back and what is refunded. */
    public void notifyCustomerReturn(Order order, String itemsSummary, long refundMinor) {
        send("notifyCustomerReturn", "ORDER_RETURN", order, locale -> {
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
            return new CustomerBot.Dm(t.toString(), chatButton(order, locale));
        });
    }

    /** The tracking number was corrected after shipping → DM the customer the new one. */
    public void notifyCustomerTracking(Order order) {
        if (order.getTrackingNumber() == null) {
            return;
        }
        send("notifyCustomerTracking", "ORDER_TRACKING", order, locale -> {
            String text = messages.get(locale, "bot.tracking.changed",
                    shortId(order), escHtml(order.getTrackingNumber()));
            return new CustomerBot.Dm(text, chatButton(order, locale));
        });
    }

    /** Admin posted a chat message → DM the customer with a deep-link to the order chat. */
    public void onAdminChatMessage(Order order, String preview) {
        send("onAdminChatMessage", "CHAT_REPLY", order, locale -> {
            StringBuilder t = new StringBuilder();
            t.append(messages.get(locale, "bot.newMessage", shortId(order))).append('\n');
            if (preview != null && !preview.isBlank()) {
                t.append("<blockquote>").append(escHtml(trim(ChatPreview.localize(preview, locale, messages), 160)))
                        .append("</blockquote>\n");
            }
            t.append(messages.get(locale, "bot.newMessage.cta"));
            return new CustomerBot.Dm(t.toString(), chatButton(order, locale));
        });
    }

    /** Money arrived online (monobank) → DM the customer that the payment went through. */
    public void onPaymentReceived(Order order, long amountMinor) {
        String cur = nz(order.getCurrency());
        send("onPaymentReceived (customer)", "PAYMENT_RECEIVED", order, locale -> {
            String text = messages.get(locale, "bot.paid.title") + "\n"
                    + messages.get(locale, "bot.order") + " <b>#" + shortId(order) + "</b>\n"
                    + messages.get(locale, "bot.paid.body", money(amountMinor) + " " + cur);
            return new CustomerBot.Dm(text, orderButton(order, locale));
        });
    }

    /** The admin answered the customer's cancellation request → DM the customer in their language. */
    public void notifyCustomerCancelRequest(Order order, boolean approved) {
        String journalType = approved ? "CANCEL_REQUEST_APPROVED" : "CANCEL_REQUEST_DECLINED";
        send("notifyCustomerCancelRequest", journalType, order, locale -> {
            long received = OrderMoney.receivedMinor(order);
            String text = approved
                    ? messages.get(locale, "bot.cancelRequest.approved", shortId(order),
                            money(received) + " " + nz(order.getCurrency()))
                    : messages.get(locale, "bot.cancelRequest.declined", shortId(order),
                            escHtml(nz(order.getCancelRequestAdminComment())));
            return new CustomerBot.Dm(text, approved
                    ? orderButton(order, locale) : chatButton(order, locale));
        });
    }

    // ----- sending and buttons -----

    private boolean canReach(Order order) {
        return customerBot.canReach(order.getTgUserId());
    }

    private boolean send(String name, String journalType, Order order, Function<Locale, CustomerBot.Dm> compose) {
        return canReach(order) && customerBot.sendTo(name + " failed for order " + idStr(order),
                order.getTgUserId(), journal(journalType, order), compose);
    }

    /** Journal entry for a message to this order's customer. */
    private ActivityLog.Entry journal(String type, Order order) {
        return ActivityLog.Entry.bot(type).toCustomer(order.getTgUserId()).order(order.getId());
    }

    private void skipped(Order order, String type, String text, String reason) {
        customerBot.skipped(journal(type, order), text, reason);
    }

    /** Opens the order page itself in the Mini App (deep link view_<id>). */
    private InlineKeyboardMarkup orderButton(Order order, Locale locale) {
        return customerBot.miniAppButton(messages.get(locale, "bot.openOrder"), "view_" + idStr(order));
    }

    /** Opens the cart in the Mini App (deep link {@code cart}). */
    private InlineKeyboardMarkup cartButton(Locale locale) {
        return customerBot.miniAppButton(messages.get(locale, "bot.giftCase.toCart"), "cart");
    }

    /** Opens the order's chat in the Mini App. */
    private InlineKeyboardMarkup chatButton(Order order, Locale locale) {
        return customerBot.miniAppButton(messages.get(locale, "bot.openChat"), "order_" + idStr(order));
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
