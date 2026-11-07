package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.TokenUsage;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.Workers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Characterization of the in-memory job queue as it is before the queue moves to the database (docs/ai-admin/05-plan,
 * Э0): RUNNING → DONE, a failure answers with its own error, the 14th job (3 running + 10 waiting) is «busy».
 */
class AiJobsTest {

    private final AiAgent agent = mock(AiAgent.class);
    private final Workers workers = new Workers();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC);
    private final AiJobs jobs = new AiJobs(agent, new ConcurrentMapCacheManager(AiCaches.JOBS.name()), workers, clock);

    private static final AiAgent.Ask ASK = new AiAgent.Ask(AiFeature.CARD, "Q", "low", 0);
    private static final AiAgent.Answer ANSWER = new AiAgent.Answer("A", "m", 10, TokenUsage.NONE, 1, 0, 0, false, 5);

    @AfterEach
    void stop() throws Exception {
        workers.destroy();
    }

    @Test
    void startedJobIsRunningAndThenDoneWithTheAnswer() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        when(agent.configured()).thenReturn(true);
        when(agent.ask(any())).thenAnswer(i -> {
            release.await(5, TimeUnit.SECONDS);
            return ANSWER;
        });

        AiJobs.JobView started = jobs.start(ASK);

        assertThat(started.status()).isEqualTo(AiJobs.Status.RUNNING);
        assertThat(jobs.get(started.id()).status()).isEqualTo(AiJobs.Status.RUNNING);
        release.countDown();
        AiJobs.JobView done = waitFor(started.id());
        assertThat(done.status()).isEqualTo(AiJobs.Status.DONE);
        assertThat(done.answer().text()).isEqualTo("A");
    }

    @Test
    void failedJobAnswersWithItsOwnError() throws Exception {
        when(agent.configured()).thenReturn(true);
        when(agent.ask(any())).thenThrow(new DomainException.Conflict(AiError.MONTH_LIMIT, "10.00", "10.00"));

        AiJobs.JobView started = jobs.start(ASK);

        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            try {
                jobs.get(started.id());
                Thread.sleep(20);
            } catch (DomainException e) {
                assertThat(e.errorCode()).isEqualTo(AiError.MONTH_LIMIT);
                return;
            }
        }
        throw new AssertionError("job did not fail in time");
    }

    @Test
    void withoutAKeyTheJobIsNotStarted() {
        when(agent.configured()).thenReturn(false);

        assertThatThrownBy(() -> jobs.start(ASK)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.NOT_CONFIGURED));
    }

    @Test
    void moreThanThreeRunningAndTenWaitingIsBusy() {
        CountDownLatch release = new CountDownLatch(1);
        when(agent.configured()).thenReturn(true);
        when(agent.ask(any())).thenAnswer(i -> {
            release.await(5, TimeUnit.SECONDS);
            return ANSWER;
        });
        try {
            for (int i = 0; i < AiJobs.THREADS + AiJobs.QUEUE; i++) {
                jobs.start(ASK);
            }
            assertThatThrownBy(() -> jobs.start(ASK)).isInstanceOfSatisfying(DomainException.class,
                    e -> assertThat(e.errorCode()).isEqualTo(AiError.BUSY));
        } finally {
            release.countDown();
        }
    }

    @Test
    void unknownJobIsNotFound() {
        assertThatThrownBy(() -> jobs.get("nope")).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.JOB_NOT_FOUND));
    }

    private AiJobs.JobView waitFor(String id) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            AiJobs.JobView v = jobs.get(id);
            if (v.status() != AiJobs.Status.RUNNING) {
                return v;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("job still running");
    }
}
