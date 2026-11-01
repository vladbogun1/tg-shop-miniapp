package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.order.app.Checkout;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The gift-case expiry reminder reads promo codes, orders and users and claims the code, on a real MySQL (audit package 5). */
class GiftReminderDbBoundsIT extends AbstractMysqlIT {

    @Autowired
    Checkout checkout;
    @Autowired
    GiftCasePromoReminderJob job;

    private long user(boolean blocked) {
        long tg = 9_400_000_000_000L + (System.nanoTime() / 1000) % 1_000_000_000L;
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, created_at, last_seen_at, is_premium, "
                + "bot_blocked) VALUES (?, ?, 'IT', now(), now(), false, ?)", tg, "it_" + tg, blocked);
        return tg;
    }

    private byte[] order(long tg, Product p) {
        return checkout.createOrder(checkout(tg, "+380991" + (tg % 1_000_000), p, 1)).getId();
    }

    private String code(byte[] orderId, int uses, boolean active) {
        String code = "GC" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO promo_codes (id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active, "
                        + "expires_at, source, source_order_id, created_at) VALUES (?, ?, 10, 0, 1, ?, ?, ?, 'GIFT_CASE', ?, ?)",
                com.maxsolch.shop.platform.util.UuidUtil.toBytes(UUID.randomUUID().toString()), code, uses, active, Timestamp.from(Instant.now().plus(Duration.ofDays(1))), orderId,
                Timestamp.from(Instant.now().minus(Duration.ofDays(10))));
        return code;
    }

    private Timestamp reminded(String code) {
        return jdbc.queryForObject("SELECT expiry_reminded_at FROM promo_codes WHERE code = ?", Timestamp.class, code);
    }

    @Test
    void reminderGoesOnceForUnusedCodesOfUnblockedCustomers() {
        when(customerNotifier.notifyCustomerCasePromoExpiring(any(), any(), anyInt(), anyLong(), any())).thenReturn(true);
        Product p = product(10_000, 20);
        long ok = user(false);
        byte[] okOrder = order(ok, p);
        long blocked = user(true);
        byte[] blockedOrder = order(blocked, p);
        long other = user(false);
        byte[] usedOrder = order(other, p);
        String due = code(okOrder, 0, true);
        String blockedCode = code(blockedOrder, 0, true);
        String used = code(usedOrder, 1, true);

        job.run();
        job.run();

        verify(customerNotifier).notifyCustomerCasePromoExpiring(any(), eq(due), anyInt(), anyLong(), any());
        verify(customerNotifier, never()).notifyCustomerCasePromoExpiring(any(), eq(blockedCode), anyInt(), anyLong(), any());
        verify(customerNotifier, never()).notifyCustomerCasePromoExpiring(any(), eq(used), anyInt(), anyLong(), any());
        assertThat(reminded(due)).isNotNull();
        assertThat(reminded(blockedCode)).isNull();
        assertThat(reminded(used)).isNull();
    }
}
