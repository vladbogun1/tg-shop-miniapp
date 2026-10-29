package com.maxsolch.shop.gift;

import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.tg.NotificationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * "Your code from the case runs out soon": a bot DM {@code gift.promoReminderDays} before an unused
 * personal code of a gift case (a discount prize or a swap, source GIFT_CASE) expires, once per code.
 * Codes younger than that window are left alone (the reminder would follow the code itself). Respects
 * the days setting (0 = off) and the customer-DM switch {@code notify.customerStatus}; the order's chat
 * is where the code was announced, so the reminder goes there too.
 */
@Slf4j
@Component
public class GiftCasePromoReminderJob {

    static final int BATCH = 50;

    private final JdbcTemplate jdbc;
    private final SettingsService settings;
    private final OrderRepository orders;
    private final NotificationService notifications;
    private Clock clock = Clock.systemUTC();

    public GiftCasePromoReminderJob(JdbcTemplate jdbc, SettingsService settings, OrderRepository orders,
                                    NotificationService notifications) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.orders = orders;
        this.notifications = notifications;
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.gift.reminder-ms:1800000}", initialDelay = 480_000)
    public void run() {
        try {
            int sent = sendDue();
            if (sent > 0) {
                log.info("Sent {} case promo expiry reminder(s)", sent);
            }
        } catch (RuntimeException e) {
            log.warn("Case promo expiry reminder run failed: {}", e.toString());
        }
    }

    /** An unused case code that runs out soon. */
    record Candidate(byte[] promoId, byte[] orderId, String code, int percent, long amountMinor, Instant expiresAt) {
    }

    /** @return how many reminders went out */
    int sendDue() {
        if (!settings.get(SettingsRegistry.NOTIFY_CUSTOMER_STATUS, true)) {
            return 0;
        }
        int days = settings.get(SettingsRegistry.GIFT_PROMO_REMINDER_DAYS, 3);
        if (days <= 0) {
            return 0;
        }
        Instant now = clock.instant();
        Duration window = Duration.ofDays(days);
        int sent = 0;
        for (Candidate c : candidates(now, now.plus(window), now.minus(window))) {
            // Claimed before sending: a second instance (or a retry) never DMs the same code twice.
            if (jdbc.update("update promo_codes set expiry_reminded_at = ? where id = ? and expiry_reminded_at is null",
                    Timestamp.from(now), c.promoId()) != 1) {
                continue;
            }
            var order = orders.findById(c.orderId()).orElse(null);
            if (order != null && notifications.notifyCustomerCasePromoExpiring(order, c.code(), c.percent(),
                    c.amountMinor(), c.expiresAt())) {
                sent++;
            }
        }
        return sent;
    }

    /**
     * Unused, still valid case codes expiring in {@code (now, expiresBy]}, issued no later than
     * {@code issuedBefore}, not reminded yet, of an order with a Telegram chat whose owner has not
     * blocked the bot; soonest first.
     */
    List<Candidate> candidates(Instant now, Instant expiresBy, Instant issuedBefore) {
        return jdbc.query("select p.id, p.source_order_id, p.code, p.discount_percent, p.discount_amount_minor, "
                        + "p.expires_at from promo_codes p "
                        + "join orders o on o.id = p.source_order_id "
                        + "left join users u on u.telegram_user_id = o.tg_user_id "
                        + "where p.source = '" + GiftService.PROMO_SOURCE + "' and p.active = true "
                        + "and p.expiry_reminded_at is null "
                        + "and o.tg_user_id is not null and o.tg_user_id > 0 "
                        + "and p.expires_at > ? and p.expires_at <= ? and p.created_at <= ? "
                        + "and (p.max_uses is null or p.uses_count < p.max_uses) "
                        + "and coalesce(u.bot_blocked, false) = false "
                        + "order by p.expires_at limit ?",
                (rs, i) -> new Candidate(rs.getBytes("id"), rs.getBytes("source_order_id"), rs.getString("code"),
                        rs.getInt("discount_percent"), rs.getLong("discount_amount_minor"),
                        rs.getTimestamp("expires_at").toInstant()),
                Timestamp.from(now), Timestamp.from(expiresBy), Timestamp.from(issuedBefore), BATCH);
    }
}
