package com.maxsolch.shop.platform.jobs;

import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;

/**
 * A named mutual-exclusion lock that lives in the database (the {@code shedlock} table), for work that must not
 * run twice at once across backend instances but is not a scheduled job: "one broadcast at a time", "one payment
 * start per order". The in-memory alternatives ({@code synchronized}, {@code ConcurrentHashMap} of locks) are invisible
 * to a second instance.
 *
 * <p>The lock expires by itself {@code atMostFor} after the last {@link Held#extend} - if the instance dies, nobody
 * waits longer than that. Long work extends it while it makes progress. The time is the database's own clock.
 * Do not hold it across a database transaction you also expect to roll back with it: the lock row is committed on its
 * own, independently of the caller's transaction.
 */
@Component
public class DbLocks {

    private static final Duration POLL = Duration.ofMillis(100);

    private final LockProvider provider;
    private final Clock clock;

    public DbLocks(LockProvider provider, Clock clock) {
        this.provider = provider;
        this.clock = clock;
    }

    /** The lock {@code name} when nobody holds it, else empty. */
    public Optional<Held> tryLock(String name, Duration atMostFor) {
        return provider.lock(new LockConfiguration(clock.instant(), name, atMostFor, Duration.ZERO)).map(Held::new);
    }

    /**
     * Like {@link #tryLock}, but polls for up to {@code maxWait} while someone else holds it: the second of two
     * simultaneous requests waits for the first instead of being refused (what {@code synchronized} did in memory).
     */
    public Optional<Held> lockWaiting(String name, Duration atMostFor, Duration maxWait) {
        long deadline = System.nanoTime() + maxWait.toNanos();
        while (true) {
            Optional<Held> held = tryLock(name, atMostFor);
            if (held.isPresent() || System.nanoTime() >= deadline) {
                return held;
            }
            try {
                Thread.sleep(POLL.toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Optional.empty();
            }
        }
    }

    /** A lock taken by {@link #tryLock}; release it in {@code finally}. */
    public static final class Held implements AutoCloseable {

        private SimpleLock lock;

        private Held(SimpleLock lock) {
            this.lock = lock;
        }

        /** Keeps the lock for {@code atMostFor} more from now (long work calls this as it progresses). */
        public void extend(Duration atMostFor) {
            lock = lock.extend(atMostFor, Duration.ZERO).orElse(lock);
        }

        public void release() {
            lock.unlock();
        }

        @Override
        public void close() {
            release();
        }
    }
}
