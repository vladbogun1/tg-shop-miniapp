package com.maxsolch.shop.platform.jobs;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;

class DbLocksTest {

    private final InMemoryLockProvider table = new InMemoryLockProvider();
    private final DbLocks locks = new DbLocks(table, Clock.systemUTC());

    @Test
    void aHeldLockRefusesTheSecondTakerUntilReleased() {
        DbLocks.Held first = locks.tryLock("order-return:1", Duration.ofMinutes(3)).orElseThrow();

        assertThat(locks.tryLock("order-return:1", Duration.ofMinutes(3))).isEmpty();
        assertThat(locks.tryLock("order-return:2", Duration.ofMinutes(3))).isPresent();

        first.release();
        assertThat(locks.tryLock("order-return:1", Duration.ofMinutes(3))).isPresent();
    }

    @Test
    void aLockOfADeadInstanceExpiresByItself() {
        locks.tryLock("payment-start:1", Duration.ofMinutes(2)).orElseThrow();

        table.advance(Duration.ofMinutes(3));

        assertThat(locks.tryLock("payment-start:1", Duration.ofMinutes(2))).isPresent();
    }

    @Test
    void lockWaitingTakesTheLockAsSoonAsTheHolderReleases() {
        DbLocks.Held first = locks.tryLock("payment-start:1", Duration.ofMinutes(2)).orElseThrow();
        CompletableFuture<Boolean> second = CompletableFuture.supplyAsync(() ->
                locks.lockWaiting("payment-start:1", Duration.ofMinutes(2), Duration.ofSeconds(5)).isPresent());

        first.release();

        assertThat(second.join()).isTrue();
    }

    @Test
    void lockWaitingGivesUpAfterTheWait() {
        locks.tryLock("payment-start:1", Duration.ofMinutes(2)).orElseThrow();

        assertThat(locks.lockWaiting("payment-start:1", Duration.ofMinutes(2), Duration.ofMillis(250))).isEmpty();
    }
}
