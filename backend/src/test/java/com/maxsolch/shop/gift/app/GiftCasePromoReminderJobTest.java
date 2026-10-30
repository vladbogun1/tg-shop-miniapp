package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.gift.domain.PromoReminder;
import com.maxsolch.shop.gift.infra.GiftReminderStore;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The reminder about a case code that runs out: claimed before it is sent, so a code is never told twice. */
@ExtendWith(MockitoExtension.class)
class GiftCasePromoReminderJobTest {

    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Mock GiftReminderStore store;
    @Mock SettingsService settings;
    @Mock OrderLookup orders;
    @Mock GiftNotifier notifier;

    private GiftCasePromoReminderJob job() {
        return new GiftCasePromoReminderJob(store, settings, orders, notifier, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static PromoReminder reminder(byte id) {
        return new PromoReminder(new byte[]{id}, new byte[]{id, 1}, "CASEABC", 10, 0, NOW.plus(Duration.ofDays(2)));
    }

    @Test
    void sendsOnlyTheCodesItClaimedAndCountsTheDelivered() {
        when(settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)).thenReturn(true);
        when(settings.get(GiftSettings.GIFT_PROMO_REMINDER_DAYS, 3)).thenReturn(3);
        PromoReminder mine = reminder((byte) 1);
        PromoReminder taken = reminder((byte) 2);
        when(store.candidates(NOW, NOW.plus(Duration.ofDays(3)), NOW.minus(Duration.ofDays(3)), 50))
                .thenReturn(List.of(mine, taken));
        when(store.claim(mine.promoId(), NOW)).thenReturn(true);
        when(store.claim(taken.promoId(), NOW)).thenReturn(false);
        Order order = new Order();
        when(orders.find(mine.orderId())).thenReturn(Optional.of(order));
        when(notifier.promoExpiring(order, "CASEABC", 10, 0, mine.expiresAt())).thenReturn(true);

        assertThat(job().sendDue()).isEqualTo(1);
        verify(orders, never()).find(taken.orderId());
    }

    @Test
    void switchedOffByTheDaysSettingOrTheCustomerDmSwitch() {
        when(settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)).thenReturn(true);
        when(settings.get(GiftSettings.GIFT_PROMO_REMINDER_DAYS, 3)).thenReturn(0);

        assertThat(job().sendDue()).isZero();
        verify(store, never()).candidates(any(), any(), any(), anyInt());
        verify(store, never()).claim(any(), any());
    }
}
