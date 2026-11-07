package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiEvents.Period;
import com.maxsolch.shop.ai.infra.AiAlertStore;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.time.ShopZone;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.function.LongPredicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Each warning goes out once per period: the unique row decides, a repeat of the event is silent. */
class AiNotifierTest {

    private final AiAlertStore alerts = mock(AiAlertStore.class);
    private final AdminPushService push = mock(AdminPushService.class);
    private final AdminAccess access = mock(AdminAccess.class);
    private final AiPolicy policy = mock(AiPolicy.class);
    private final AiNotifier notifier = new AiNotifier(alerts, push, access, policy,
            Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC), new ShopZone("Europe/Kyiv"));

    @Test
    void theFirstLimitEventSendsOnePushForThePeriod() {
        when(alerts.claim("2026-11", "LIMIT_MONTH")).thenReturn(true);

        notifier.onLimit(new AiEvents.LimitReached(Period.MONTH, 10_000_000, 10_000_000));

        verify(push).notifyAdmins(any(AdminPushService.PushMessage.class), any(LongPredicate.class));
    }

    @Test
    void aRepeatInTheSamePeriodIsSilent() {
        when(alerts.claim("2026-11", "LIMIT_MONTH")).thenReturn(false);

        notifier.onLimit(new AiEvents.LimitReached(Period.MONTH, 10_000_000, 10_000_000));

        verify(push, never()).notifyAdmins(any(AdminPushService.PushMessage.class), any(LongPredicate.class));
    }

    @Test
    void theDayLimitIsKeyedByTheDay() {
        when(alerts.claim("2026-11-07", "LIMIT_DAY")).thenReturn(true);

        notifier.onLimit(new AiEvents.LimitReached(Period.DAY, 1_000_000, 1_000_000));

        verify(alerts).claim(eq("2026-11-07"), eq("LIMIT_DAY"));
        verify(push).notifyAdmins(any(AdminPushService.PushMessage.class), any(LongPredicate.class));
    }

    @Test
    void theKeyWarningIsOneRowUntilAJobSucceeds() {
        when(alerts.claim("KEY", "KEY")).thenReturn(true, false);

        notifier.onKey(new AiEvents.KeyRejected("HTTP 401"));
        notifier.onKey(new AiEvents.KeyRejected("HTTP 401"));

        verify(push).notifyAdmins(any(AdminPushService.PushMessage.class), any(LongPredicate.class));
    }

    @Test
    void theWarningGoesToAdminsWithFinanceUnlessTheOwnerNarrowedIt() {
        when(alerts.claim(any(), any())).thenReturn(true);
        when(access.canSeeFinance(1L)).thenReturn(true);
        when(access.canSeeFinance(2L)).thenReturn(false);
        when(access.isSuperAdmin(2L)).thenReturn(true);
        ArgumentCaptor<LongPredicate> to = ArgumentCaptor.forClass(LongPredicate.class);

        notifier.onSpend(new AiEvents.SpendWarning(8_000_000, 10_000_000));
        verify(push).notifyAdmins(any(AdminPushService.PushMessage.class), to.capture());
        assertThat(to.getValue().test(1L)).isTrue();
        assertThat(to.getValue().test(2L)).isFalse();

        when(policy.alertsToMainOnly()).thenReturn(true);
        notifier.onSearchDown(new AiEvents.SearchDown());
        verify(push, org.mockito.Mockito.times(2)).notifyAdmins(any(AdminPushService.PushMessage.class), to.capture());
        assertThat(to.getValue().test(2L)).isTrue();
        assertThat(to.getValue().test(1L)).isFalse();
    }
}
