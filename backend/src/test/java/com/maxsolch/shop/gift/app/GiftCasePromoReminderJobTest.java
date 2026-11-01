package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.order.app.OrderCustomerNotifier;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.promo.app.PromoExpiry;
import com.maxsolch.shop.promo.domain.ExpiringPromo;
import com.maxsolch.shop.promo.domain.PromoCode;
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
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The reminder about a case code that runs out: claimed before it is sent, so a code is never told twice. */
@ExtendWith(MockitoExtension.class)
class GiftCasePromoReminderJobTest {

    private static final Instant NOW = Instant.parse("2026-10-30T10:00:00Z");

    @Mock PromoExpiry promos;
    @Mock Customers customers;
    @Mock SettingsService settings;
    @Mock OrderLookup orders;
    @Mock OrderCustomerNotifier notifier;

    private GiftCasePromoReminderJob job() {
        return new GiftCasePromoReminderJob(promos, customers, settings, orders, notifier,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static ExpiringPromo reminder(byte id) {
        return new ExpiringPromo(new byte[]{id}, "CASEABC", 10, 0, 0, null, new byte[]{id, 1},
                NOW.plus(Duration.ofDays(2)));
    }

    private static Order orderOf(Long tgUserId) {
        Order order = mock(Order.class);
        when(order.getTgUserId()).thenReturn(tgUserId);
        return order;
    }

    /** The owner module's scan: applies the job's own "reachable" filter to the codes it would return. */
    private void scanReturns(ExpiringPromo... found) {
        when(promos.expiring(eq(PromoCode.SOURCE_GIFT_CASE), eq(NOW), eq(NOW.plus(Duration.ofDays(3))),
                eq(NOW.minus(Duration.ofDays(3))), eq(50), any()))
                .thenAnswer(i -> List.of(found).stream().filter(i.<Predicate<ExpiringPromo>>getArgument(5)).toList());
    }

    private void switchedOn() {
        when(settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)).thenReturn(true);
        when(settings.get(GiftSettings.GIFT_PROMO_REMINDER_DAYS, 3)).thenReturn(3);
    }

    @Test
    void sendsOnlyTheCodesItClaimedAndCountsTheDelivered() {
        switchedOn();
        ExpiringPromo mine = reminder((byte) 1);
        ExpiringPromo taken = reminder((byte) 2);
        Order order = orderOf(5L);
        scanReturns(mine, taken);
        when(orders.find(any())).thenReturn(Optional.of(order));
        when(promos.claimReminder(mine.promoId(), NOW)).thenReturn(true);
        when(promos.claimReminder(taken.promoId(), NOW)).thenReturn(false);
        when(notifier.notifyCustomerCasePromoExpiring(order, "CASEABC", 10, 0, mine.expiresAt())).thenReturn(true);

        assertThat(job().sendDue()).isEqualTo(1);
        verify(notifier, times(1)).notifyCustomerCasePromoExpiring(any(), any(), anyInt(), anyLong(), any());
    }

    @Test
    void codesOfBlockedCustomersOrOrdersWithoutChatAreNotReminded() {
        switchedOn();
        ExpiringPromo blocked = reminder((byte) 1);
        ExpiringPromo noChat = reminder((byte) 2);
        User user = new User();
        user.setBotBlocked(true);
        Order blockedOrder = orderOf(5L);
        Order chatless = orderOf(null);
        when(orders.find(blocked.sourceOrderId())).thenReturn(Optional.of(blockedOrder));
        when(orders.find(noChat.sourceOrderId())).thenReturn(Optional.of(chatless));
        when(customers.findById(5L)).thenReturn(Optional.of(user));
        scanReturns(blocked, noChat);

        assertThat(job().sendDue()).isZero();
        verify(promos, never()).claimReminder(any(), any());
    }

    @Test
    void switchedOffByTheDaysSettingOrTheCustomerDmSwitch() {
        when(settings.get(OrderSettings.NOTIFY_CUSTOMER_STATUS, true)).thenReturn(true);
        when(settings.get(GiftSettings.GIFT_PROMO_REMINDER_DAYS, 3)).thenReturn(0);

        assertThat(job().sendDue()).isZero();
        verify(promos, never()).expiring(any(), any(), any(), any(), anyInt(), any());
        verify(promos, never()).claimReminder(any(), any());
    }
}
