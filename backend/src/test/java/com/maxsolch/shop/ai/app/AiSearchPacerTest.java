package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.infra.AiSearchPaceStore;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The shared pace of web search: a window with room lets requests through, a full one waits, the wait is bounded. */
class AiSearchPacerTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    /** A clock that the fake sleeper moves forward. */
    private static final class Ticking extends Clock {
        Instant now = T0;

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    /** The journal: the moments of the requests made, as the table ai_usage would hold them. */
    private static final class Journal extends AiSearchPaceStore {
        final List<Instant> requests = new ArrayList<>();

        Journal() {
            super(null);
        }

        @Override
        public int requestsSince(Instant since) {
            return (int) requests.stream().filter(t -> !t.isBefore(since)).count();
        }

        @Override
        public Optional<Instant> oldestSince(Instant since) {
            return requests.stream().filter(t -> !t.isBefore(since)).min(Instant::compareTo);
        }
    }

    private final Ticking clock = new Ticking();
    private final Journal journal = new Journal();
    private final AiPolicy policy = mock(AiPolicy.class);
    private final List<Duration> slept = new ArrayList<>();
    private final AiSearchPacer pacer = new AiSearchPacer(journal, policy, clock, d -> {
        slept.add(d);
        clock.now = clock.now.plus(d);
    });

    @Test
    void aWindowWithRoomLetsTheRequestThroughAtOnce() {
        when(policy.searchPace()).thenReturn(40);
        for (int i = 0; i < 39; i++) {
            journal.requests.add(T0.minusSeconds(10));
        }

        pacer.acquire();

        assertThat(slept).isEmpty();
    }

    @Test
    void aFullWindowWaitsUntilTheOldestRequestLeavesIt() {
        when(policy.searchPace()).thenReturn(40);
        for (int i = 0; i < 40; i++) {
            journal.requests.add(T0.minusSeconds(290));
        }

        pacer.acquire();

        // the oldest ones leave the five minutes in ten seconds; the waits come in steps of at most five seconds
        assertThat(slept).isNotEmpty().allSatisfy(d -> assertThat(d).isLessThanOrEqualTo(Duration.ofSeconds(5)));
        assertThat(clock.now).isAfterOrEqualTo(T0.plusSeconds(10));
        assertThat(clock.now).isBefore(T0.plusSeconds(20));
    }

    @Test
    void theWaitIsBoundedSoATaskNeverHangs() {
        when(policy.searchPace()).thenReturn(1);
        // a request from the future never leaves the window while the clock moves less than five minutes
        journal.requests.add(T0.plus(Duration.ofMinutes(30)));

        pacer.acquire();

        assertThat(Duration.between(T0, clock.now)).isLessThanOrEqualTo(AiSearchPacer.MAX_WAIT.plusSeconds(5));
    }

    @Test
    void zeroMeansNoPace() {
        when(policy.searchPace()).thenReturn(0);
        for (int i = 0; i < 500; i++) {
            journal.requests.add(T0);
        }

        pacer.acquire();

        assertThat(slept).isEmpty();
    }
}
