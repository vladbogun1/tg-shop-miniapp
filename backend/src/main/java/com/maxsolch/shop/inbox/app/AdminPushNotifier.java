package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.inbox.app.InboxService;
import com.maxsolch.shop.media.app.MediaSigner;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.notification.app.AdminPushService.PushMessage;
import com.maxsolch.shop.inbox.app.PushOrderQueries.OrderInfo;
import com.maxsolch.shop.order.app.OrderEvents;
import com.maxsolch.shop.site.app.SiteRevalidator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.Locale;

/**
 * Turns shop events into admin push notifications: a new order, an online payment, a customer
 * chat message, the public site failing to rebuild.
 *
 * <p>Order events are handled after the commit (a rolled-back order never pings the phone), and
 * everything — even reading the order — happens on the push thread, so the request that placed
 * the order does not wait for it. Order texts carry no personal data beyond the order number and
 * amount; a chat ping shows the customer's first name and what they wrote, as a messenger would.
 */
@Slf4j
@Component
public class AdminPushNotifier {

    private final AdminPushService push;
    private final PushOrderQueries queries;
    private final InboxService inbox;
    private final MediaSigner media;

    /** Photo preview width: one of MediaThumbnailer's widths, plenty for a notification picture. */
    static final int IMAGE_WIDTH = 480;

    public AdminPushNotifier(AdminPushService push, PushOrderQueries queries, InboxService inbox, MediaSigner media) {
        this.push = push;
        this.queries = queries;
        this.inbox = inbox;
        this.media = media;
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onCreated(OrderEvents.Created event) {
        byte[] id = event.orderId();
        push.runAsync(() -> queries.order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Новый заказ #" + o.shortId(),
                money(o.totalMinor(), o.currency()) + " · " + sourceLabel(o.source()),
                "/orders/" + o.id(), "order-" + o.id(), badge(), true))));
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onPaymentReceived(OrderEvents.PaymentReceived event) {
        byte[] id = event.orderId();
        long amount = event.amountMinor();
        push.runAsync(() -> queries.order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Оплачено онлайн #" + o.shortId(),
                money(amount, o.currency()) + " через monobank — подтвердите заказ",
                "/orders/" + o.id(), "paid-" + o.id(), badge(), true))));
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onCancelRequested(OrderEvents.CancelRequested event) {
        byte[] id = event.orderId();
        push.runAsync(() -> queries.order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Запрос отмены #" + o.shortId(),
                "Покупатель просит отменить оплаченный заказ — одобрите или отклоните",
                "/orders/" + o.id(), "cancel-" + o.id(), badge(), true))));
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onChatMessage(OrderEvents.ChatMessage event) {
        if (event.fromAdmin()) {
            return;
        }
        byte[] id = event.orderId();
        // The text itself is shown, like any messenger does: hiding it on a locked screen is the
        // phone's own setting (Android «скрывать содержимое», iOS «Показ миниатюр»).
        push.runAsync(() -> queries.order(id).ifPresent(o -> push.notifyAdmins(chatMessage(o, queries.customerName(id), event))));
    }

    /** «💬 Иван П. · #467611ad» + what was written; a photo comes with its preview. */
    PushMessage chatMessage(OrderInfo o, String customer, OrderEvents.ChatMessage event) {
        String who = shortName(customer) + " · #" + o.shortId();
        String text = oneLine(event.text());
        String kind = event.kind() == null ? "TEXT" : event.kind();
        String icon;
        String body;
        String line;
        String image = null;
        switch (kind) {
            case "PHOTO" -> {
                icon = "📷";
                body = text.isEmpty() ? "Фото" : text;
                line = "📷 " + body;
                String signed = media.signedUrl(event.attachmentKey());
                image = signed == null ? null : signed + "&w=" + IMAGE_WIDTH;
            }
            case "FILE" -> {
                icon = "📎";
                String name = blank(event.fileName()) ? "Файл" : event.fileName().trim();
                body = text.isEmpty() ? name : name + " — " + text;
                line = "📎 " + body;
            }
            default -> {
                icon = "💬";
                body = text.isEmpty() ? oneLine(event.preview()) : text;
                line = body;
            }
        }
        return new PushMessage(icon + " " + who, body,
                "/orders/" + o.id() + "?tab=chat", "chat-" + o.id(), badge(), true,
                image, new AdminPushService.Group("💬 " + who, line));
    }

    @EventListener
    public void onSiteFailed(SiteRevalidator.Failed event) {
        push.runAsync(() -> push.notifyAdmins(new PushMessage(
                "Сайт не обновился",
                "Изменения не попали на сайт — подробности во «Внимании»",
                "/inbox", "site-error", badge(), false)));
    }

    /** «Иван Петров» → «Иван П.»: enough to recognise the customer, less to read over a shoulder. */
    static String shortName(String name) {
        if (blank(name)) {
            return "Клиент";
        }
        String[] parts = name.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0];
        }
        return parts[0] + " " + parts[1].substring(0, 1).toUpperCase(Locale.ROOT) + ".";
    }

    static String oneLine(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    /** «Внимание» count for the app icon badge; null (badge untouched) if it cannot be computed. */
    Integer badge() {
        try {
            return inbox.inbox().total();
        } catch (RuntimeException e) {
            log.debug("Inbox count for push badge failed: {}", e.toString());
            return null;
        }
    }

    public static String money(long minor, String currency) {
        return currency == null || "UAH".equalsIgnoreCase(currency)
                ? MoneyFormat.uah(minor)
                : MoneyFormat.amount(minor) + " " + currency;
    }

    public static String sourceLabel(String source) {
        if (source == null) {
            return "Mini App";
        }
        return switch (source) {
            case "WEB" -> "сайт";
            case "ADMIN" -> "админка";
            default -> "Mini App";
        };
    }
}
