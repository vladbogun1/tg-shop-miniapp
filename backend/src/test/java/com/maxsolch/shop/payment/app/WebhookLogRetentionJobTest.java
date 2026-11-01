package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.infra.WebhookLogStore;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class WebhookLogRetentionJobTest {

    @Test
    void purgesRowsOlderThanRetention() {
        WebhookLogStore store = mock(WebhookLogStore.class);
        Instant now = Instant.parse("2026-11-01T00:00:00Z");
        new WebhookLogRetentionJob(store, Clock.fixed(now, ZoneOffset.UTC)).purge();
        verify(store).purgeBefore(Instant.parse("2026-08-03T00:00:00Z"));
    }
}
