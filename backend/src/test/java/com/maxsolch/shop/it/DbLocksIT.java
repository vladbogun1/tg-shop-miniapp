package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.jobs.DbLocks;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;

/** {@link DbLocks} against the real shedlock table of MySQL: the exclusion that in-memory locks could not give two instances. */
class DbLocksIT extends AbstractMysqlIT {

    @Autowired
    DbLocks locks;
    @Autowired
    JdbcTemplate jdbc;

    private static String name() {
        return "it-dblocks-" + UUID.randomUUID().toString().substring(0, 8);
    }

    @Test
    void secondTakerIsRefusedUntilTheHolderReleases() {
        String name = name();
        DbLocks.Held first = locks.tryLock(name, Duration.ofMinutes(1)).orElseThrow();

        assertThat(locks.tryLock(name, Duration.ofMinutes(1))).isEmpty();

        first.release();
        DbLocks.Held again = locks.tryLock(name, Duration.ofMinutes(1)).orElseThrow();
        again.release();
        assertThat(jdbc.queryForObject("select count(*) from shedlock where name = ?", Integer.class, name)).isEqualTo(1);
    }

    @Test
    void aWaitingTakerGetsTheLockWhenTheHolderLetsGo() {
        String name = name();
        DbLocks.Held first = locks.tryLock(name, Duration.ofMinutes(1)).orElseThrow();
        CompletableFuture<Boolean> second = CompletableFuture.supplyAsync(() ->
                locks.lockWaiting(name, Duration.ofMinutes(1), Duration.ofSeconds(10))
                        .map(h -> {
                            h.release();
                            return true;
                        }).orElse(false));

        first.release();

        assertThat(second.join()).isTrue();
    }
}
