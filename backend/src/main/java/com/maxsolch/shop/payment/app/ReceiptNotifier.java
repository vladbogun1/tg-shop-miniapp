package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.notification.app.CustomerBot;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.payment.domain.ReceiptKind;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.journal.app.ActivityLog;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.util.Locale;

import static com.maxsolch.shop.notification.app.TgFormat.isHttps;
import static com.maxsolch.shop.platform.util.Texts.escHtml;

/**
 * Sends a receipt to the customer in the bot: the one place where payment talks to Telegram, so the receipt job
 * depends on this class and not on the bot. Unlike the order's other notifications it reports the outcome, so the
 * job can record it exactly once.
 */
@Slf4j
@Component
public class ReceiptNotifier {

    /** What happened to one send: delivered, the customer blocked the bot, or it failed (retry later). */
    public enum Delivery { SENT, BLOCKED, FAILED }

    private final Messages messages;
    private final CustomerBot customerBot;

    public ReceiptNotifier(Messages messages, CustomerBot customerBot) {
        this.messages = messages;
        this.customerBot = customerBot;
    }

    /** A bot token is configured: worth preparing receipts at all. */
    public boolean isBotEnabled() {
        return customerBot.enabled();
    }

    /**
     * A payment receipt (fiscal check of a sale / refund, or the bank receipt) as a PDF document in the customer's
     * DMs, with the tax-service link and the «open order» button.
     */
    public Delivery send(Order order, byte[] pdf, ReceiptKind kind, String taxUrl) {
        if (!customerBot.canReach(order.getTgUserId()) || pdf == null || pdf.length == 0) {
            return Delivery.FAILED;
        }
        String id = UuidUtil.toString(order.getId());
        String shortId = id == null ? "?" : id.substring(0, 8);
        try {
            Locale locale = customerBot.localeOf(order.getTgUserId());
            StringBuilder caption = new StringBuilder(messages.get(locale, "bot.receipt." + kind.name(), shortId));
            if (taxUrl != null && isHttps(taxUrl)) {
                caption.append('\n').append("<a href=\"").append(escHtml(taxUrl).replace("\"", "&quot;")).append("\">")
                        .append(messages.get(locale, "bot.receipt.taxLink")).append("</a>");
            }
            customerBot.sendDocument(order.getTgUserId(), pdf, kind.fileName(shortId), caption.toString(),
                    customerBot.miniAppButton(messages.get(locale, "bot.openOrder"), "view_" + id),
                    ActivityLog.Entry.bot("RECEIPT").toCustomer(order.getTgUserId()).order(order.getId())
                            .text(messages.get(locale, "bot.receipt." + kind.name(), shortId))
                            .detail("kind", kind.name())
                            .detail("file", kind.fileName(shortId)));
            return Delivery.SENT;
        } catch (Exception e) {
            String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
            if (m.contains("blocked") || m.contains("deactivated") || m.contains("chat not found")
                    || m.contains("bot can't initiate")) {
                return Delivery.BLOCKED;
            }
            log.warn("sendReceipt {} failed for order {}: {}", kind, id, e.getMessage());
            return Delivery.FAILED;
        }
    }
}
