package com.maxsolch.shop.inbox;

import com.maxsolch.shop.analytics.metrics.AdminMetricsService;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.inbox.InboxDtos.DismissRequest;
import com.maxsolch.shop.inbox.InboxDtos.Inbox;
import com.maxsolch.shop.inbox.InboxDtos.RestoreRequest;
import com.maxsolch.shop.inbox.InboxDtos.SnoozeRequest;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.site.SiteRevalidator;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Snooze presets, «Разобрано» only for informational rows (with a journal entry), undo. */
@ExtendWith(MockitoExtension.class)
class InboxServiceTest {

    static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    static final String ORDER = "0191a2b3-0000-7000-8000-000000000001";

    @Mock
    InboxStore store;
    @Mock
    AdminMetricsService metrics;
    @Mock
    SiteRevalidator site;
    @Mock
    SettingsService settings;
    @Mock
    AdminAuditService audit;

    InboxService service;

    @BeforeEach
    void setUp() {
        service = new InboxService(store, metrics, site, settings, audit, new AppProperties());
        lenient().when(audit.currentAdminName()).thenReturn("Max");
    }

    // ------------------------------------------------------------------ snooze presets

    @Test
    void until_hourAndThreeDays() {
        Instant now = Instant.parse("2026-10-04T12:00:00Z");
        assertThat(InboxService.until(InboxService.SnoozePreset.HOUR, now, KYIV)).isEqualTo(now.plus(Duration.ofHours(1)));
        assertThat(InboxService.until(InboxService.SnoozePreset.DAYS3, now, KYIV)).isEqualTo(now.plus(Duration.ofDays(3)));
    }

    @Test
    void until_tomorrowNineShopTime() {
        // 15:00 in Kyiv (UTC+3 in October) → tomorrow 09:00 Kyiv = 06:00 UTC
        Instant afternoon = Instant.parse("2026-10-04T12:00:00Z");
        assertThat(InboxService.until(InboxService.SnoozePreset.TOMORROW, afternoon, KYIV))
                .isEqualTo(Instant.parse("2026-10-05T06:00:00Z"));
    }

    @Test
    void until_tomorrowAtNightMeansThisMorning() {
        // 02:00 in Kyiv: «до завтра» is the coming morning, not the one after
        Instant night = Instant.parse("2026-10-04T23:00:00Z"); // 02:00 on Oct 5 in Kyiv
        assertThat(InboxService.until(InboxService.SnoozePreset.TOMORROW, night, KYIV))
                .isEqualTo(Instant.parse("2026-10-05T06:00:00Z"));
    }

    @Test
    void snooze_storesTheMarkWithTheEventVersion() {
        Instant before = Instant.now();
        var res = service.snooze(new SnoozeRequest("payment", ORDER, "1759570000000", "hour"));

        ArgumentCaptor<InboxMark> mark = ArgumentCaptor.forClass(InboxMark.class);
        verify(store).upsert(mark.capture(), isNull(), eq("Max"));
        assertThat(mark.getValue().type()).isEqualTo(InboxItemType.PAYMENT);
        assertThat(mark.getValue().entityId()).isEqualTo(ORDER);
        assertThat(mark.getValue().version()).isEqualTo("1759570000000");
        assertThat(mark.getValue().kind()).isEqualTo(InboxMark.Kind.SNOOZED);
        assertThat(res.until()).isAfterOrEqualTo(before.plus(Duration.ofHours(1)));
        verify(store).purge(any(), any());
        verify(audit, never()).record(any(), any(), any(), any());
    }

    @Test
    void snooze_rejectsBadInput() {
        assertThatThrownBy(() -> service.snooze(new SnoozeRequest("NOPE", ORDER, "1", "HOUR")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.snooze(new SnoozeRequest("CHAT", ORDER, "1", "FOREVER")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.snooze(new SnoozeRequest("CHAT", ORDER, " ", "HOUR")))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.snooze(new SnoozeRequest("CHAT", "", "1", "HOUR")))
                .isInstanceOf(BadRequestException.class);
        verify(store, never()).upsert(any(), any(), any());
    }

    // ------------------------------------------------------------------ dismiss

    @Test
    void dismiss_onlyInformationalRows() {
        assertThatThrownBy(() -> service.dismiss(new DismissRequest("PAYMENT", ORDER, "1")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("только отложить");
        assertThatThrownBy(() -> service.dismiss(new DismissRequest("NEW_STALE", ORDER, "1")))
                .isInstanceOf(BadRequestException.class);
        verify(store, never()).upsert(any(), any(), any());
    }

    @Test
    void dismiss_returnIsStoredAndJournaled() {
        service.dismiss(new DismissRequest("RETURN", ORDER, "1759570000000"));

        ArgumentCaptor<InboxMark> mark = ArgumentCaptor.forClass(InboxMark.class);
        verify(store).upsert(mark.capture(), isNull(), eq("Max"));
        assertThat(mark.getValue().kind()).isEqualTo(InboxMark.Kind.DISMISSED);
        assertThat(mark.getValue().until()).isNull();
        verify(audit).record(eq("INBOX_DISMISS"), eq("ORDER"), eq(ORDER), eq(
                "«Внимание» → Отказы и возвраты: разобрано (заказ #0191a2b3)"));
    }

    @Test
    void dismiss_variantRowIsJournaledAgainstTheProduct() {
        service.dismiss(new DismissRequest("LOW_STOCK", "prod-1:var-2", "3"));

        verify(audit).record(eq("INBOX_DISMISS"), eq("PRODUCT"), eq("prod-1"), anyString());
    }

    // ------------------------------------------------------------------ restore

    @Test
    void restore_ofADismissedRowIsJournaled_ofASnoozeIsNot() {
        when(store.delete(InboxItemType.RETURN, ORDER))
                .thenReturn(new InboxMark(InboxItemType.RETURN, ORDER, "1", InboxMark.Kind.DISMISSED, null));
        when(store.delete(InboxItemType.CHAT, ORDER))
                .thenReturn(new InboxMark(InboxItemType.CHAT, ORDER, "1", InboxMark.Kind.SNOOZED, Instant.now()));

        service.restore(new RestoreRequest("RETURN", ORDER));
        service.restore(new RestoreRequest("CHAT", ORDER));

        verify(audit).record(eq("INBOX_RESTORE"), eq("ORDER"), eq(ORDER), anyString());
        verify(audit, times(1)).record(eq("INBOX_RESTORE"), any(), any(), any());
    }

    // ------------------------------------------------------------------ the screen

    @Test
    void inbox_usesThresholdsFromSettings_andSurvivesAStockFailure() {
        when(settings.getInt(SettingsRegistry.INBOX_NEW_STALE_HOURS)).thenReturn(5);
        when(settings.getInt(SettingsRegistry.INBOX_APPROVED_STALE_HOURS)).thenReturn(48);
        when(store.candidateOrders(any(), any(), any())).thenReturn(List.of());
        when(store.unreadChats()).thenReturn(List.of());
        when(store.marks()).thenReturn(Map.of());
        when(metrics.runningOut()).thenThrow(new IllegalStateException("db down"));
        when(site.status()).thenReturn(new SiteRevalidator.Status(false, null, null, null));

        Inbox inbox = service.inbox();

        assertThat(inbox.newStaleHours()).isEqualTo(5);
        assertThat(inbox.approvedStaleHours()).isEqualTo(48);
        assertThat(inbox.total()).isZero();
        ArgumentCaptor<Instant> newCutoff = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> approvedCutoff = ArgumentCaptor.forClass(Instant.class);
        verify(store).candidateOrders(newCutoff.capture(), approvedCutoff.capture(), any());
        assertThat(Duration.between(newCutoff.getValue(), approvedCutoff.getValue())).isEqualTo(Duration.ofHours(-43));
    }
}
