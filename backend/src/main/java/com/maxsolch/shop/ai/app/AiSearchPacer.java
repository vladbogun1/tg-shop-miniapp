package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.infra.AiSearchPaceStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * The shared pace of web search for every AI task (a batch of thirty must not get the free search engine banned):
 * at most {@code ai.searchPace} requests in {@link #WINDOW} counted over the journal {@code ai_usage}, i.e. over all
 * instances. A task that hits the pace waits (a few seconds, in steps) instead of failing. The «rest» of a provider
 * that failed also lives in the database ({@code ai_search_rest}), not in one instance's memory: the second instance of
 * a rollout sees it too. The pace is soft: requests are counted when they are journalled, so three parallel jobs may
 * overshoot by two.
 */
@Component
public class AiSearchPacer {

    public static final Duration WINDOW = Duration.ofMinutes(5);
    /** A provider that failed is left out of the chain this long. */
    public static final Duration REST = Duration.ofMinutes(10);
    static final Duration MAX_WAIT = Duration.ofSeconds(120);
    private static final Duration STEP_MAX = Duration.ofSeconds(5);

    /** Sleeps; replaced in tests. */
    @FunctionalInterface
    interface Sleeper {
        void sleep(Duration d) throws InterruptedException;
    }

    private final AiSearchPaceStore store;
    private final AiPolicy policy;
    private final Clock clock;
    private final Sleeper sleeper;

    @Autowired
    public AiSearchPacer(AiSearchPaceStore store, AiPolicy policy, Clock clock) {
        this(store, policy, clock, d -> Thread.sleep(d.toMillis()));
    }

    AiSearchPacer(AiSearchPaceStore store, AiPolicy policy, Clock clock, Sleeper sleeper) {
        this.store = store;
        this.policy = policy;
        this.clock = clock;
        this.sleeper = sleeper;
    }

    /** Before one search request: returns at once while the window has room, else waits for a place (at most two minutes). */
    public void acquire() {
        int limit = policy.searchPace();
        Instant gaveUp = clock.instant().plus(MAX_WAIT);
        while (limit > 0) {
            Instant now = clock.instant();
            Instant from = now.minus(WINDOW);
            if (store.requestsSince(from) < limit || !now.isBefore(gaveUp)) {
                return;
            }
            Optional<Instant> oldest = store.oldestSince(from);
            Duration wait = oldest.map(o -> Duration.between(now, o.plus(WINDOW))).orElse(Duration.ofSeconds(1));
            if (!pause(wait)) {
                return;
            }
        }
    }

    public boolean resting(String provider) {
        return store.restUntil(provider).filter(until -> until.isAfter(clock.instant())).isPresent();
    }

    public void rest(String provider, String reason) {
        store.rest(provider, clock.instant().plus(REST), reason);
    }

    public void wake(String provider) {
        if (store.restUntil(provider).isPresent()) {
            store.clear(provider);
        }
    }

    private boolean pause(Duration wait) {
        Duration step = wait.isNegative() || wait.isZero() ? Duration.ofMillis(200) : wait.compareTo(STEP_MAX) > 0 ? STEP_MAX : wait;
        try {
            sleeper.sleep(step);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
