package com.maxsolch.shop.push;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.inbox.InboxService;
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
 * the order does not wait for it. Texts are short and carry no personal data beyond the order
 * number and amount: they show on a lock screen.
 */
@Slf4j
@Component
public class PushNotificationListener {

    private final AdminPushService push;
    private final JdbcTemplate jdbc;
    private final InboxService inbox;

    public PushNotificationListener(AdminPushService push, JdbcTemplate jdbc, InboxService inbox) {
        this.push = push;
        this.jdbc = jdbc;
        this.inbox = inbox;
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
        // The message text itself stays out of the notification: it can hold a phone number or
        // an address, and the notification shows on a locked screen.
        push.runAsync(() -> order(id).ifPresent(o -> push.notifyAdmins(new PushMessage(
                "Сообщение по заказу #" + o.shortId(),
                "Клиент написал в чат — откройте, чтобы ответить",
                "/orders/" + o.id() + "?tab=chat", "chat-" + o.id(), badge(), true))));
    }

    @EventListener
    public void onSiteFailed(SiteRevalidator.Failed event) {
        push.runAsync(() -> push.notifyAdmins(new PushMessage(
                "Сайт не обновился",
                "Изменения не попали на maxsolkh.shop — подробности во «Внимании»",
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
