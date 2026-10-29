package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.LineProducts;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/** The metrics window of the supply screen: Kyiv days and the conversion from hold to purchase. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PreorderQueueAdminMetricsTest {

    @Mock PreorderSubscriptionRepository subs;
    @Mock BatchCatalog batches;
    @Mock LineProducts lineProducts;
    @Mock UserRepository users;
    @Mock ProductRepository products;
    @Mock PreorderQueueService queue;
    @Mock SettingsService settings;
    @Mock ApplicationEventPublisher events;

    PreorderQueueAdmin admin;

    @BeforeEach
    void setUp() {
        admin = new PreorderQueueAdmin(subs, batches, lineProducts, users, products, queue, settings, events,
                Clock.fixed(Instant.parse("2026-10-27T10:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void metricsRejectABrokenPeriod() {
        LocalDate d = LocalDate.of(2026, 10, 1);

        assertThatThrownBy(() -> admin.metrics(d, d.minusDays(1))).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> admin.metrics(d, d.plusDays(500))).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> admin.metrics(null, d)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void metricsUseKyivDaysAndComputeTheConversion() {
        Instant from = LocalDate.of(2026, 10, 1).atStartOfDay(ShopZone.DEFAULT).toInstant();
        Instant to = LocalDate.of(2026, 10, 8).atStartOfDay(ShopZone.DEFAULT).toInstant();
        when(subs.joinedBetween(from, to)).thenReturn(List.<Object[]>of(new Object[]{12L, 9L}));
        when(subs.holdUnitsGiven(from, to)).thenReturn(8L);
        when(subs.closedAfterHold(eq("BOUGHT"), eq(from), eq(to))).thenReturn(3L);
        when(subs.closedAfterHold(eq("EXPIRED"), eq(from), eq(to))).thenReturn(4L);
        when(batches.arrivedUnitsBetween(from, to)).thenReturn(40L);

        var m = admin.metrics(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 7));

        assertThat(m.subscriptions()).isEqualTo(12);
        assertThat(m.people()).isEqualTo(9);
        assertThat(m.holdsGiven()).isEqualTo(8);
        assertThat(m.boughtFromHold()).isEqualTo(3);
        assertThat(m.expired()).isEqualTo(4);
        assertThat(m.conversionPercent()).isEqualTo(37.5);
        assertThat(m.arrivedUnits()).isEqualTo(40);
    }

    @Test
    void metricsConversionIsZeroWhenNothingWasHeld() {
        when(subs.joinedBetween(any(), any())).thenReturn(List.of());

        var m = admin.metrics(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

        assertThat(m.conversionPercent()).isZero();
        assertThat(m.subscriptions()).isZero();
    }
}
