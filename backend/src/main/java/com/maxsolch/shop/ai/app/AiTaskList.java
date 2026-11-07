package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobPath;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.SubjectLabels;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The lists of the task center «ИИ-задачи»: four tabs (Идут · Проверить · Проблемы · История) over the AI's own jobs
 * (the marks of the manual way are not tasks and never listed), a page at a time. Every admin reads it; the money and
 * the prompt are left out of a row for those without the finance right ({@link AiJobDto}). A row also carries who
 * started the task and a readable name of its object.
 */
@Service
public class AiTaskList {

    /** The tabs of the screen. «Проблемы»: what failed or came back empty in the last week and was not asked again. */
    public enum Tab {
        ACTIVE, REVIEW, PROBLEMS, HISTORY;

        static Tab parse(String s) {
            try {
                return valueOf(s == null ? "" : s.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new DomainException.BadRequest(AiError.BAD_REQUEST, "tab");
            }
        }
    }

    static final int MAX_SIZE = 50;
    static final Duration PROBLEM_WINDOW = Duration.ofDays(7);
    private static final List<JobStatus> ACTIVE = List.of(JobStatus.QUEUED, JobStatus.RUNNING);
    private static final List<JobStatus> PROBLEM = List.of(JobStatus.FAILED, JobStatus.BAD_ANSWER, JobStatus.EMPTY);

    /** A row: the job (no texts), who started it, the name of its object (null when unknown). */
    public record Row(AiJobDto job, String adminName, String subjectLabel) {
    }

    /** What each tab holds right now, for the numbers on the tabs. */
    public record Counts(long active, long review, long problems) {
    }

    public record TaskPage(List<Row> items, long total, int page, int size, Counts counts) {
    }

    private final AiJobRepository jobs;
    private final AdminAccess access;
    private final AdminDirectory admins;
    private final CurrentActor actor;
    private final List<SubjectLabels> labels;
    private final Clock clock;

    public AiTaskList(AiJobRepository jobs, AdminAccess access, AdminDirectory admins, CurrentActor actor,
                      List<SubjectLabels> labels, Clock clock) {
        this.jobs = jobs;
        this.access = access;
        this.admins = admins;
        this.actor = actor;
        this.labels = labels;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TaskPage page(String tab, int page, int size) {
        Tab t = Tab.parse(tab);
        Pageable p = PageRequest.of(Math.max(0, page), Math.min(MAX_SIZE, Math.max(1, size)));
        Page<AiJob> found = find(t, p);
        boolean finance = access.canSeeFinance(actor.userId());
        Map<String, String> names = names(found.getContent());
        Map<Long, String> admin = adminNames(found.getContent());
        List<Row> rows = found.getContent().stream()
                .map(j -> new Row(AiJobDto.of(j, null, finance), admin.get(j.getAdminId()),
                        names.get(j.getSubjectType() + ":" + j.getSubjectId())))
                .toList();
        return new TaskPage(rows, found.getTotalElements(), p.getPageNumber(), p.getPageSize(), counts());
    }

    private Page<AiJob> find(Tab t, Pageable p) {
        return switch (t) {
            case ACTIVE -> jobs.findByPathAndStatusInOrderByIdDesc(JobPath.BUILTIN, ACTIVE, p);
            case REVIEW -> jobs.findByPathAndStatusAndOutcomeIsNullOrderByIdDesc(JobPath.BUILTIN, JobStatus.DONE, p);
            case PROBLEMS -> jobs.problems(PROBLEM, clock.instant().minus(PROBLEM_WINDOW), p);
            case HISTORY -> jobs.findByPathOrderByIdDesc(JobPath.BUILTIN, p);
        };
    }

    private Counts counts() {
        Pageable one = PageRequest.of(0, 1);
        return new Counts(jobs.countByPathAndStatusIn(JobPath.BUILTIN, ACTIVE),
                jobs.countByPathAndStatusAndOutcomeIsNull(JobPath.BUILTIN, JobStatus.DONE),
                jobs.problems(PROBLEM, clock.instant().minus(PROBLEM_WINDOW), one).getTotalElements());
    }

    /** "TYPE:id" → name, one call per subject type. */
    private Map<String, String> names(List<AiJob> list) {
        Map<String, Set<String>> byType = new HashMap<>();
        for (AiJob j : list) {
            byType.computeIfAbsent(j.getSubjectType(), k -> new LinkedHashSet<>()).add(j.getSubjectId());
        }
        Map<String, String> out = new HashMap<>();
        for (SubjectLabels l : labels) {
            Set<String> ids = byType.get(l.subjectType());
            if (ids != null) {
                l.labels(new ArrayList<>(ids)).forEach((id, name) -> out.put(l.subjectType() + ":" + id, name));
            }
        }
        return out;
    }

    private Map<Long, String> adminNames(List<AiJob> list) {
        return list.stream().map(AiJob::getAdminId).distinct()
                .collect(Collectors.toMap(id -> id, id -> admins.displayName(id).orElse(""), (a, b) -> a));
    }
}
