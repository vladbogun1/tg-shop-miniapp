package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The front door of the AI tasks: what is refused before a task exists (switches, a limit, a second task for the
 * object, a bad request), what a repeated key and a lost race answer, and what a retry is allowed.
 */
class AiJobsTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");

    private final AiJobLifecycle lifecycle = mock(AiJobLifecycle.class);
    private final AiJobReads reads = mock(AiJobReads.class);
    private final AiLimits limits = mock(AiLimits.class);
    private final AiPolicy policy = mock(AiPolicy.class);
    private final AiAgent agent = mock(AiAgent.class);
    private final AdminAccess access = mock(AdminAccess.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final AiJobs jobs = new AiJobs(lifecycle, reads, mock(AiOutcome.class), limits, mock(AiBatchRunner.class), policy,
            mock(AiEstimate.class), agent, access, actor, audit);

    @BeforeEach
    void setUp() {
        when(actor.userId()).thenReturn(7L);
        when(agent.configured()).thenReturn(true);
        when(policy.enabled()).thenReturn(true);
        when(policy.featureOn(any())).thenReturn(true);
        when(reads.activeFor(any(), any(), anyBoolean())).thenReturn(Optional.empty());
        when(reads.byKey(anyLong(), any(), anyBoolean())).thenReturn(Optional.empty());
    }

    private static boolean anyBoolean() {
        return org.mockito.ArgumentMatchers.anyBoolean();
    }

    private static long anyLong() {
        return org.mockito.ArgumentMatchers.anyLong();
    }

    private static AiJobs.CreateJob request() {
        return new AiJobs.CreateJob(AiFeature.CARD, "PRODUCT", "42", "v1", null, "medium", 1, "Заполни карточку", "card-1");
    }

    private static AiJob saved(long id, long adminId) {
        AiJob job = AiJob.queued(new AiJob.Spec(AiFeature.CARD, adminId, "PRODUCT", "42", "v1", JobMode.NORMAL, "medium",
                1, "card-1", null, null), T0);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    private static AiJobDto dto(long id) {
        return AiJobDto.of(saved(id, 7), null, false);
    }

    @Test
    void aGoodRequestMakesAQueuedJobBoundToTheAdminOfTheRequest() {
        AiJob job = saved(11, 7);
        when(lifecycle.insert(any(), eq("Заполни карточку"))).thenReturn(job);
        when(reads.read(11L, 7L, false)).thenReturn(Optional.of(dto(11)));

        AiJobDto out = jobs.create(request(), null);

        assertThat(out.id()).isEqualTo(11);
        org.mockito.ArgumentCaptor<AiJob.Spec> spec = org.mockito.ArgumentCaptor.forClass(AiJob.Spec.class);
        verify(lifecycle).insert(spec.capture(), anyString());
        assertThat(spec.getValue().adminId()).isEqualTo(7);
        assertThat(spec.getValue().mode()).isEqualTo(JobMode.NORMAL);
        verify(audit).record(eq("AI_JOB_START"), eq("PRODUCT"), eq("42"), anyString());
    }

    @Test
    void theSameKeyAnswersWithTheFirstJobAndStartsNothing() {
        when(reads.byKey(7L, "k1", false)).thenReturn(Optional.of(dto(5)));

        assertThat(jobs.create(request(), "k1").id()).isEqualTo(5);
        verify(lifecycle, never()).insert(any(), any());
    }

    @Test
    void aSecondTaskForTheSameObjectIs409WithTheCurrentJob() {
        when(reads.activeFor("PRODUCT", "42", false)).thenReturn(Optional.of(dto(5)));

        assertThatThrownBy(() -> jobs.create(request(), null)).isInstanceOfSatisfying(DomainException.Conflict.class, e -> {
            assertThat(e.errorCode()).isEqualTo(AiError.JOB_ACTIVE);
            assertThat(e.getDetails()).containsKey("job");
        });
        verify(lifecycle, never()).insert(any(), any());
    }

    @Test
    void aRaceLostToTheDatabaseBecomesTheSame409() {
        when(lifecycle.insert(any(), any())).thenThrow(new DataIntegrityViolationException("uq_ai_jobs_active"));
        when(reads.activeFor("PRODUCT", "42", false)).thenReturn(Optional.empty(), Optional.of(dto(5)));

        assertThatThrownBy(() -> jobs.create(request(), null)).isInstanceOfSatisfying(DomainException.Conflict.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.JOB_ACTIVE));
    }

    @Test
    void switchedOffFeatureIsRefusedBeforeAnyMoneyIsLooked() {
        when(policy.featureOn(AiFeature.CARD)).thenReturn(false);

        assertThatThrownBy(() -> jobs.create(request(), null)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.DISABLED));
        verify(limits, never()).preflight(any(), any(), anyInt());
    }

    @Test
    void withoutAKeyTheAiIsNotConfigured() {
        when(agent.configured()).thenReturn(false);

        assertThatThrownBy(() -> jobs.create(request(), null)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.NOT_CONFIGURED));
    }

    @Test
    void requestsAreValidatedBeforeAnythingElse() {
        assertThatThrownBy(() -> AiJobs.validate(null, null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiJobs.CreateJob(AiFeature.SEARCH_TEST, "X", "1", null, null,
                "low", 0, "Q", null), null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiJobs.CreateJob(AiFeature.CARD, "", "1", null, null, "low", 0,
                "Q", null), null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiJobs.CreateJob(AiFeature.CARD, "P", "1", null, null, "max", 0,
                "Q", null), null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(new AiJobs.CreateJob(AiFeature.CARD, "P", "1", null, null, "low", 11,
                "Q", null), null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> AiJobs.validate(request(), "x".repeat(65))).isInstanceOf(DomainException.BadRequest.class);
        AiJobs.validate(request(), "ok-key");
    }

    private AiJobReads.Source finished(long id, String prompt) {
        AiJob old = saved(id, 3);
        old.claim("w", T0, Duration.ofMinutes(5));
        old.finish(JobStatus.BAD_ANSWER, JobTotals.NONE, T0);
        return new AiJobReads.Source(old, prompt);
    }

    @Test
    void aRetryIsThoroughAndLinkedToTheOldJob() {
        when(reads.source(9L)).thenReturn(Optional.of(finished(9, "Старый запрос")));
        AiJob fresh = saved(10, 7);
        when(lifecycle.insert(any(), eq("Старый запрос"))).thenReturn(fresh);
        when(reads.read(10L, 7L, false)).thenReturn(Optional.of(dto(10)));

        jobs.retry(9L);

        org.mockito.ArgumentCaptor<AiJob.Spec> spec = org.mockito.ArgumentCaptor.forClass(AiJob.Spec.class);
        verify(lifecycle).insert(spec.capture(), anyString());
        assertThat(spec.getValue().mode()).isEqualTo(JobMode.THOROUGH);
        assertThat(spec.getValue().effort()).isEqualTo("high");
        assertThat(spec.getValue().retryOf()).isEqualTo(9L);
    }

    @Test
    void anAdminGetsOneRetryPerJobButTheOwnerMayRepeat() {
        when(reads.source(9L)).thenReturn(Optional.of(finished(9, "Запрос")));
        when(reads.retried(9L)).thenReturn(true);

        assertThatThrownBy(() -> jobs.retry(9L)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.RETRY_LIMIT));

        when(access.canSeeFinance(7L)).thenReturn(true);
        when(lifecycle.insert(any(), any())).thenReturn(saved(10, 7));
        when(reads.read(10L, 7L, true)).thenReturn(Optional.of(AiJobDto.of(saved(10, 7), null, true)));
        assertThat(jobs.retry(9L).id()).isEqualTo(10);
    }

    @Test
    void aRetryNeedsThePromptAndAFinishedJob() {
        when(reads.source(9L)).thenReturn(Optional.of(finished(9, null)));
        assertThatThrownBy(() -> jobs.retry(9L)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.PROMPT_GONE));

        when(reads.source(8L)).thenReturn(Optional.of(new AiJobReads.Source(saved(8, 3), "Запрос")));
        assertThatThrownBy(() -> jobs.retry(8L)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.BAD_STATE));
    }

    @Test
    void anAdminWithoutFinanceReadsHisOwnInvoiceButDoesNotRepeatAnotherAdminsReading() {
        when(access.canSeeFinance(7L)).thenReturn(false);
        var req = new AiJobs.CreateJob(AiFeature.SUPPLY_EXTRACT, "SUPPLY_FILES", "f1", null, null, "low", 2, "prompt", "supply-1");
        when(lifecycle.insert(any(), any())).thenReturn(saved(10, 7));
        when(reads.read(10L, 7L, false)).thenReturn(Optional.of(AiJobDto.of(saved(10, 7), null, false)));
        assertThat(jobs.create(req, null).id()).isEqualTo(10);

        when(reads.source(9L)).thenReturn(Optional.of(new AiJobReads.Source(supplyJob(9, 8L), "prompt")));
        assertThatThrownBy(() -> jobs.retry(9L)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.NOT_YOUR_JOB));
    }

    private static AiJob supplyJob(long id, long adminId) {
        AiJob job = AiJob.queued(new AiJob.Spec(AiFeature.SUPPLY_EXTRACT, adminId, "SUPPLY_FILES", "f1", null, JobMode.NORMAL, "low",
                2, null, null, null), T0);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }
}
