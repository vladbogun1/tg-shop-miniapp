package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.app.AiJobLifecycle.Claimed;
import com.maxsolch.shop.ai.app.AiJobLifecycle.Live;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiEvents;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiScope;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.PauseReason;
import com.maxsolch.shop.ai.domain.ResultWriter;
import com.maxsolch.shop.ai.infra.AiAlertStore;
import com.maxsolch.shop.ai.infra.AiUsageQueries;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * One job from "taken" to "ended": the reserve in the limits, the conversation with the model, the structural check
 * of the answer, the end written to the database. Before every model turn the {@link AiAgent.Gate} looks into the
 * database: stopped by the admin, switched off by the owner, past the deadline, over the ceiling of one job, over a
 * limit. A stop pressed during the last model call is seen right after it returns: the job is CANCELED, not
 * handed to review. Whatever happens, the reserve is released and the job gets an end (unless the server took it away meanwhile).
 */
@Slf4j
@Service
public class AiJobRunner {

    private final AiAgent agent;
    private final AiJobLifecycle lifecycle;
    private final AiLimits limits;
    private final AiPolicy policy;
    private final AiEstimate estimate;
    private final AiAnswerCheck check;
    private final AiUsageQueries usage;
    private final AiAlertStore alerts;
    private final AiSpendWatch watch;
    private final AiBatchRunner batches;
    private final AiOutcome outcomes;
    private final AiJobImages images;
    private final Map<AiFeature, ResultWriter> writers = new EnumMap<>(AiFeature.class);
    private final DomainEvents events;
    private final Clock clock;

    public AiJobRunner(AiAgent agent, AiJobLifecycle lifecycle, AiLimits limits, AiPolicy policy, AiEstimate estimate,
                       AiAnswerCheck check, AiUsageQueries usage, AiAlertStore alerts, AiSpendWatch watch,
                       AiBatchRunner batches, AiOutcome outcomes, AiJobImages images, List<ResultWriter> resultWriters, DomainEvents events,
                       Clock clock) {
        this.agent = agent;
        this.lifecycle = lifecycle;
        this.limits = limits;
        this.policy = policy;
        this.estimate = estimate;
        this.check = check;
        this.usage = usage;
        this.alerts = alerts;
        this.watch = watch;
        this.batches = batches;
        this.outcomes = outcomes;
        this.images = images;
        resultWriters.forEach(w -> this.writers.put(w.feature(), w));
        this.events = events;
        this.clock = clock;
    }

    public void run(String worker, Claimed claimed) {
        AiJob job = claimed.job();
        long id = job.getId();
        try {
            var pictures = images.of(job);
            limits.reserve(job);
            // for an invoice «researchItems» counts pictures (the price grows with them): no web research there
            int research = pictures.isEmpty() ? job.getResearchItems() : 0;
            AiAgent.Ask ask = new AiAgent.Ask(AiScope.job(job.getFeature(), id, job.getAdminId()), claimed.prompt(),
                    job.getEffort(), research, () -> beforeTurn(job), pictures,
                    new AiJobSteps(step -> lifecycle.step(id, worker, step), clock));
            AiAgent.Answer answer = agent.ask(ask);
            // «Остановить» pressed while the model was answering: the answer is not used, the spend stays recorded
            refuseIfStopped(id);
            JobStatus verdict = check.check(answer.text(), 1);
            ResultWriter.Written written = verdict == JobStatus.DONE ? write(job, claimed.prompt(), answer.text()) : null;
            boolean completed = lifecycle.complete(id, worker, verdict, answer.text(), answer.repaired()).isPresent();
            if (written != null && completed) {
                outcomes.record(id, new AiJob.Outcome(written.applied(), written.rejected(), 0, written.ignoredLocked()));
            }
            alerts.clear("KEY");
        } catch (DomainException e) {
            ended(worker, job, e);
        } catch (RuntimeException e) {
            log.warn("ai job {} failed", id, e);
            lifecycle.fail(id, worker, AiError.MODEL_FAILED.name(), e.getClass().getSimpleName());
        } finally {
            limits.release(id);
            watch.afterJob();
            if (job.getBatchId() != null) {
                batches.jobEnded(job.getBatchId());
            }
        }
    }

    /** The module that owns the objects writes the result itself (translations); null: the screen applies it. */
    private ResultWriter.Written write(AiJob job, String prompt, String answer) {
        ResultWriter writer = writers.get(job.getFeature());
        return writer == null ? null : writer.write(job, prompt, answer);
    }

    private void ended(String worker, AiJob job, DomainException e) {
        long id = job.getId();
        AiError reason = e.errorCode() instanceof AiError a ? a : AiError.MODEL_FAILED;
        if (job.getBatchId() != null && pausesBatch(reason)) {
            // the job did nothing wrong: it waits in the queue, the batch waits for a person
            lifecycle.returnToQueue(id, worker);
            switch (reason) {
                case DAY_LIMIT -> batches.limitHit(job.getBatchId(), false);
                case MONTH_LIMIT -> batches.limitHit(job.getBatchId(), true);
                default -> batches.paused(job.getBatchId(), PauseReason.DISABLED);
            }
            return;
        }
        if (reason == AiError.CANCELED) {
            lifecycle.cancel(id, worker);
            return;
        }
        if (reason == AiError.KEY_REJECTED) {
            events.publish(new AiEvents.KeyRejected(String.valueOf(e.args().length > 0 ? e.args()[0] : "")));
        }
        String note = e.args().length > 0 ? String.valueOf(e.args()[0]) : null;
        lifecycle.fail(id, worker, reason.name(), note);
    }

    private static boolean pausesBatch(AiError reason) {
        return reason == AiError.DAY_LIMIT || reason == AiError.MONTH_LIMIT || reason == AiError.DISABLED;
    }

    /** After the model returned: a stop requested meanwhile cancels the job instead of handing the answer to review. */
    private void refuseIfStopped(long id) {
        Optional<Live> live = lifecycle.live(id);
        if (live.isEmpty() || live.get().cancelRequested()) {
            throw new DomainException.Conflict(AiError.CANCELED);
        }
    }

    /** The gate: reads the job from the database each time, so a stop pressed on another instance counts too. */
    private void beforeTurn(AiJob job) {
        Optional<Live> live = lifecycle.live(job.getId());
        if (live.isEmpty() || live.get().status() != JobStatus.RUNNING || live.get().cancelRequested()) {
            throw new DomainException.Conflict(AiError.CANCELED);
        }
        if (!policy.killSwitchOn()) {
            throw new DomainException.Conflict(AiError.DISABLED);
        }
        if (live.get().deadlineAt() != null && clock.instant().isAfter(live.get().deadlineAt())) {
            throw new DomainException.Conflict(AiError.DEADLINE);
        }
        long ceiling = estimate.ceilingMicroUsd(job.getFeature(), job.getMode(), Math.max(1, job.getResearchItems()),
                policy.ceilingFactor());
        if (ceiling > 0 && usage.spentByJob(job.getId()) >= ceiling) {
            throw new DomainException.Conflict(AiError.JOB_CEILING);
        }
        limits.ensureRoom(job.getId());
    }
}
