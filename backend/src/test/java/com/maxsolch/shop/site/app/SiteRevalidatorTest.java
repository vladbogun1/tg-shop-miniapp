package com.maxsolch.shop.site.app;

import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.site.domain.FakeSiteCache;
import com.maxsolch.shop.site.domain.SiteRevalidationFailed;
import com.maxsolch.shop.site.domain.SiteRevalidationRequested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SiteRevalidatorTest {

    private final DomainEvents events = mock(DomainEvents.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-30T10:00:00Z"), ZoneOffset.UTC);

    private SiteRevalidator over(FakeSiteCache cache) {
        Workers workers = mock(Workers.class);
        when(workers.scheduled(any())).thenReturn(mock(ScheduledExecutorService.class));
        return new SiteRevalidator(cache, events, clock, workers);
    }

    private SiteRevalidationRequested published() {
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publish(event.capture());
        return (SiteRevalidationRequested) event.getValue();
    }

    @Test
    void everyPathGoesOutUnprefixedAndWithBothLocalePrefixes() {
        over(new FakeSiteCache(true)).revalidate(List.of("/", "/catalog"));

        assertThat(published().paths())
                .containsExactly("/", "/ru", "/en", "/catalog", "/ru/catalog", "/en/catalog");
    }

    @Test
    void aProductChangeAlsoRebuildsThePreviousSlugAndItsCategories() {
        over(new FakeSiteCache(true)).productChanged("new", "old", List.of("mice", " "));

        assertThat(published().paths())
                .contains("/product/new", "/product/old", "/catalog/mice", "/en/catalog/mice")
                .doesNotContain("/catalog/ ");
    }

    @Test
    void whenTheSiteIsNotConfiguredNothingIsQueuedAndTheManualRunSaysWhy() {
        SiteRevalidator revalidator = over(new FakeSiteCache(false));

        revalidator.revalidate(List.of("/"));
        revalidator.allChanged();

        verify(events, never()).publish(any());
        assertThat(revalidator.revalidateAllNow()).contains("SITE_REVALIDATE_URL");
        assertThat(revalidator.status().enabled()).isFalse();
    }

    @Test
    void successIsRememberedInTheStatus() {
        FakeSiteCache cache = new FakeSiteCache(true);
        SiteRevalidator revalidator = over(cache);

        assertThat(revalidator.revalidateAllNow()).isNull();

        assertThat(cache.calls()).singleElement().satisfies(c -> assertThat(c.all()).isTrue());
        assertThat(revalidator.status().lastSuccessAt()).isEqualTo(clock.instant());
        assertThat(revalidator.status().lastError()).isNull();
    }

    @Test
    void aFailureIsReturnedRememberedAndAnnouncedOncePerOutage() {
        SiteRevalidator revalidator = over(new FakeSiteCache(true).failingWith("HTTP 502"));

        assertThat(revalidator.revalidateAllNow()).isEqualTo("HTTP 502");
        assertThat(revalidator.revalidateAllNow()).isEqualTo("HTTP 502");

        assertThat(revalidator.status().lastError()).isEqualTo("HTTP 502");
        assertThat(revalidator.status().lastErrorAt()).isEqualTo(clock.instant());
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events, times(1)).publish(event.capture());
        assertThat(event.getValue()).isEqualTo(new SiteRevalidationFailed("HTTP 502"));
    }
}
