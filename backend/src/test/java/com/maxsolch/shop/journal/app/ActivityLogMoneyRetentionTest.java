package com.maxsolch.shop.journal.app;

import com.maxsolch.shop.journal.infra.ActivityLogStore;
import com.maxsolch.shop.journal.domain.JournalOrders;
import com.maxsolch.shop.journal.domain.JournalPeople;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Money events of the journal live 3 years, the rest 90 days. */
class ActivityLogMoneyRetentionTest {

    @Test
    void moneyEventsAreRecognised() {
        assertThat(ActivityLogStore.isMoneyEvent("PAYMENT", "PAYMENT_SUCCESS")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("PAYMENT", "REFUND")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("BOT", "RECEIPT")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("SITE", "PAYMENT_START_FAILED")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("SITE", "INVOICE_CREATED")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("SITE", "AMOUNT_MISMATCH")).isTrue();
        assertThat(ActivityLogStore.isMoneyEvent("BOT", "BROADCAST")).isFalse();
        assertThat(ActivityLogStore.isMoneyEvent("SITE", "ORDER_CREATED")).isFalse();
        assertThat(ActivityLogStore.isMoneyEvent("SITE", null)).isFalse();
    }

    @Test
    void theShortPurgeSkipsMoneyRowsAndTheLongOneTakesEverything() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), eq(Timestamp.from(Instant.EPOCH)))).thenReturn(0);
        ActivityLogStore store = new ActivityLogStore(jdbc, mock(JournalOrders.class), mock(JournalPeople.class));

        store.purgeBefore(Instant.EPOCH);
        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("AND NOT (source = 'PAYMENT'"),
                eq(Timestamp.from(Instant.EPOCH)));

        store.purgeMoneyBefore(Instant.EPOCH);
        verify(jdbc).update(eq("DELETE FROM activity_log WHERE created_at < ? LIMIT 5000"),
                eq(Timestamp.from(Instant.EPOCH)));
    }

    @Test
    void moneyWindowIsNeverShorterThanTheGeneralOne() {
        ActivityLogStore store = mock(ActivityLogStore.class);
        ActivityLogRetentionJob r = new ActivityLogRetentionJob(store, 90, 30, java.time.Clock.systemUTC());
        assertThat(r.moneyRetentionDays()).isEqualTo(90);
        assertThat(new ActivityLogRetentionJob(store, 90, 1095, java.time.Clock.systemUTC()).moneyRetentionDays()).isEqualTo(1095);
    }

    @Test
    void purgeUsesBothWindows() {
        ActivityLogStore store = mock(ActivityLogStore.class);
        new ActivityLogRetentionJob(store, 90, 1095, java.time.Clock.systemUTC()).purge();
        verify(store).purgeBefore(org.mockito.ArgumentMatchers.argThat(
                t -> Duration.between(t, Instant.now()).toDays() == 90));
        verify(store).purgeMoneyBefore(org.mockito.ArgumentMatchers.argThat(
                t -> Duration.between(t, Instant.now()).toDays() == 1095));
        verify(store, never()).search(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt());
    }
}
