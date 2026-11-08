package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.app.AiOutcome;
import com.maxsolch.shop.ai.app.AiServerJobs;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyPlan;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The AI tasks of a supply draft: each step is one task (several for the cards) whose object is the draft
 * ({@code SUPPLY_DRAFT}, {@code d12-read} / {@code d12-match} / {@code d12-c-L3}), started for the draft's admin by
 * the server. The limits, switches and «one task per object» are the AI module's; a refusal comes as its exception.
 */
@Component
class SupplyDraftAi {

    static final String SUBJECT = "SUPPLY_DRAFT";
    /** The model searches the web only for new models; the server takes at most 10 searches per task. */
    static final int MAX_RESEARCH = 10;

    /** A finished task: {@code answer} is set only when it is DONE. */
    record Result(boolean done, String answer, String error) {
    }

    private final AiServerJobs jobs;
    private final AiOutcome outcome;

    SupplyDraftAi(AiServerJobs jobs, AiOutcome outcome) {
        this.jobs = jobs;
        this.outcome = outcome;
    }

    long read(long draftId, long adminId, List<Long> fileIds, String prompt, String version) {
        return jobs.start(adminId, new AiJobs.CreateJob(AiFeature.SUPPLY_EXTRACT, SUBJECT, "d" + draftId + "-read", null,
                JobMode.NORMAL, "low", fileIds.size(), prompt, version), fileIds);
    }

    long match(long draftId, long adminId, int open, String prompt, String version) {
        return jobs.start(adminId, new AiJobs.CreateJob(AiFeature.SUPPLY_MATCH, SUBJECT, "d" + draftId + "-match", null,
                JobMode.NORMAL, "low", Math.min(open, MAX_RESEARCH), prompt, version), List.of());
    }

    long card(long draftId, long adminId, String productKey, String prompt) {
        return jobs.start(adminId, new AiJobs.CreateJob(AiFeature.CARD, SUBJECT, "d" + draftId + "-c-" + productKey, null,
                JobMode.NORMAL, "medium", 1, prompt, "supply-card-1"), List.of());
    }

    /** Empty while the task runs (or when it is gone); otherwise how it ended. */
    Optional<Result> result(long jobId, long adminId) {
        Optional<AiJobDto> job = jobs.read(jobId, adminId);
        if (job.isEmpty()) {
            return Optional.of(new Result(false, null, "задача ИИ не найдена"));
        }
        AiJobDto j = job.get();
        if (j.status().active()) {
            return Optional.empty();
        }
        if (j.status() == JobStatus.DONE && j.answer() != null) {
            return Optional.of(new Result(true, j.answer(), null));
        }
        return Optional.of(new Result(false, null, failure(j)));
    }

    /** What a running task does now, for the progress line («Ищу: …»); null when it waits or is done. */
    AiJobDto job(long jobId, long adminId) {
        return jobs.read(jobId, adminId).orElse(null);
    }

    void cancel(Long jobId) {
        if (jobId != null) {
            jobs.cancel(jobId);
        }
    }

    /**
     * The tasks of the draft get their outcome from it, so they never wait in «ИИ-задачи»: accepted — the reading and
     * the matching are applied, a card is applied when its new product was created (a line later matched to our
     * product threw its card away); deleted — everything is rejected.
     */
    void settle(DraftState s, boolean accepted) {
        List<Long> applied = new ArrayList<>();
        List<Long> rejected = new ArrayList<>();
        (accepted ? applied : rejected).addAll(Stream.of(s.getReadJob(), s.getMatchJob()).filter(Objects::nonNull).toList());
        Set<String> created = accepted
                ? SupplyPlan.newProducts(s.getRows()).stream().map(p -> SupplyDraftCards.keyOf(p, s)).collect(Collectors.toSet())
                : Set.of();
        for (Map.Entry<String, Long> e : s.getCardJobs().entrySet()) {
            (created.contains(e.getKey()) ? applied : rejected).add(e.getValue());
        }
        outcome.settle(applied, rejected);
    }

    static String failure(AiJobDto j) {
        return switch (j.status()) {
            case CANCELED -> "остановлено";
            case EMPTY -> "ИИ вернул пустой ответ";
            case BAD_ANSWER -> "ответ ИИ не удалось прочитать";
            default -> SupplyDraftReasons.of(j.errorCode());
        };
    }
}
