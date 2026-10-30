package com.maxsolch.shop.platform.jobs;

import net.javacrumbs.shedlock.core.ExtensibleLockProvider;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.SimpleLock;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** A one-process stand-in for the database lock table of ShedLock, for unit tests of code that takes {@link DbLocks}. */
public class InMemoryLockProvider implements ExtensibleLockProvider {

    private final Map<String, Instant> until = new HashMap<>();
    private Instant now = Instant.parse("2026-10-30T10:00:00Z");

    /** Moves the stand-in's clock, so a test can let a lock expire. */
    public synchronized void advance(Duration d) {
        now = now.plus(d);
    }

    @Override
    public synchronized Optional<SimpleLock> lock(LockConfiguration cfg) {
        Instant held = until.get(cfg.getName());
        if (held != null && held.isAfter(now)) {
            return Optional.empty();
        }
        until.put(cfg.getName(), now.plus(cfg.getLockAtMostFor()));
        return Optional.of(new Lock(cfg));
    }

    private final class Lock implements SimpleLock {
        private final LockConfiguration cfg;

        Lock(LockConfiguration cfg) {
            this.cfg = cfg;
        }

        @Override
        public void unlock() {
            synchronized (InMemoryLockProvider.this) {
                until.remove(cfg.getName());
            }
        }

        @Override
        public Optional<SimpleLock> extend(Duration atMostFor, Duration atLeastFor) {
            synchronized (InMemoryLockProvider.this) {
                until.put(cfg.getName(), now.plus(atMostFor));
            }
            return Optional.of(this);
        }
    }
}
