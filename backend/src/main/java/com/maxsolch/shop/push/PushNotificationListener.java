package com.maxsolch.shop.push;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.inbox.InboxService;
import com.maxsolch.shop.media.MediaSigner;
import com.maxsolch.shop.push.AdminPushService.PushMessage;
import com.maxsolch.shop.service.OrderEvents;
import com.maxsolch.shop.site.SiteRevalidator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;

/**
 * Turns shop events into admin push notifications: a new order, a «я оплатил» claim, a customer
 * chat message, the public site failing to rebuild.
 *
 * <p>Order events are handled after the commit (a rolled-back order never pings the phone), and
 * everything — even reading the order — happens on the push thread, so the request that placed
 * the order does not wait for it. Order texts carry no personal data beyond the order number and
 * amount; a chat ping shows the customer's first name and what they wrote, as a messenger would.
 */
@Slf4j
@Component
public class PushNotificationListener {

    private final AdminPushService push;
    private final JdbcTemplate jdbc;
    private final InboxService inbox;
    private final MediaSigner media;

    /** Photo preview width: one of MediaThumbnailer's widths, plenty for a notification picture. */
    static final int IMAGE_WIDTH = 480;

    public PushNotificationListener(AdminPushService push, JdbcTemplate jdbc, InboxService inbox, MediaSigner media) {
        this.push = push;
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.media = media;
    }

    /** Amount + where the order came from, read fresh after the commit. */
    record OrderInfo(String id, String shortId, long totalMinor, String currency, String source) {
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onCreated(OrderEvents.Created event) {
        byte[] id = event.orderId();
        push.runAsync(() -> order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Новый заказ #" + o.shortId(),
                money(o.totalMinor(), o.currency()) + " · " + sourceLabel(o.source()),
                "/orders/" + o.id(), "order-" + o.id(), badge(), true))));
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onPaymentClaimed(OrderEvents.PaymentClaimed event) {
        byte[] id = event.orderId();
        push.runAsync(() -> order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Клиент оплатил #" + o.shortId(),
                "«Я оплатил» · " + money(o.totalMinor(), o.currency()) + " — проверьте поступление",
                "/orders/" + o.id(), "pay-" + o.id(), badge(), true))));
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onChatMessage(OrderEvents.ChatMessage event) {
        if (event.fromAdmin()) {
            return;
        }
        byte[] id = event.orderId();
        // The text itself is shown, like any messenger does: hiding it on a locked screen is the
        // phone's own setting (Android «скрывать содержимое», iOS «Показ миниатюр»).
        push.runAsync(() -> order(id).ifPresent(o -> push.notifyAdmins(chatMessage(o, customerName(id), event))));
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

    java.util.Optional<OrderInfo> order(byte[] orderId) {
        List<OrderInfo> rows = jdbc.query(
                "select total_minor, currency, source from orders where id = ?",
                (rs, i) -> {
                    String uuid = UuidUtil.toString(orderId);
                    return new OrderInfo(uuid, uuid.substring(0, 8), rs.getLong("total_minor"),
                            rs.getString("currency"), rs.getString("source"));
                },
                (Object) orderId);
        return rows.stream().findFirst();
    }

    String customerName(byte[] orderId) {
        try {
            List<String> names = jdbc.queryForList("select customer_name from orders where id = ?", String.class, (Object) orderId);
            return names.isEmpty() ? null : names.get(0);
        } catch (RuntimeException e) {
            log.debug("Customer name for push failed: {}", e.toString());
            return null;
        }
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

    static String money(long minor, String currency) {
        DecimalFormatSymbols sym = DecimalFormatSymbols.getInstance(Locale.ROOT);
        sym.setGroupingSeparator(' ');
        sym.setDecimalSeparator(',');
        DecimalFormat f = new DecimalFormat(minor % 100 == 0 ? "#,##0" : "#,##0.00", sym);
        String sign = currency == null || "UAH".equalsIgnoreCase(currency) ? "₴" : currency;
        return f.format(minor / 100.0) + " " + sign;
    }

    static String sourceLabel(String source) {
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
