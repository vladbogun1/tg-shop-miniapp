package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI tasks of the admin screens: start for an object, poll, stop, retry thoroughly, report the outcome. A task runs on
 * the server (in the database queue), so the page may be closed and opened again. For any admin; the money and the
 * prompt in the answers are only for an admin with the finance right.
 */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin AI", description = "AI tasks: start, poll, stop, retry, outcome; estimate before the start")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiJobsController {

    private final AiJobs jobs;

    public AdminAiJobsController(AiJobs jobs) {
        this.jobs = jobs;
    }

    @PostMapping("/jobs")
    @Operation(summary = "Start a task for an object. Answers at once with a QUEUED job; 409 AI_JOB_ACTIVE (with the "
            + "current job) when the object already has an active one; the same Idempotency-Key returns the first job")
    public AiJobDto start(@RequestBody AiJobs.CreateJob body,
                          @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return jobs.create(body, idempotencyKey);
    }

    @GetMapping("/jobs/active")
    @Operation(summary = "Queued and running tasks, newest first, without texts")
    public List<AiJobDto> active() {
        return jobs.active();
    }

    @GetMapping("/jobs/{id}")
    @Operation(summary = "The task: status, and the answer when it has one")
    public AiJobDto job(@PathVariable long id) {
        return jobs.get(id);
    }

    @PostMapping("/jobs/{id}/cancel")
    @Operation(summary = "Stop: a queued task ends at once, a running one before its next model turn")
    public AiJobDto cancel(@PathVariable long id) {
        return jobs.cancel(id);
    }

    @PostMapping("/jobs/{id}/retry")
    @Operation(summary = "Ask again more thoroughly (high effort); one retry per task for a non-finance admin")
    public AiJobDto retry(@PathVariable long id) {
        return jobs.retry(id);
    }

    @PostMapping("/jobs/{id}/outcome")
    @Operation(summary = "What the admin did with the result (counts of fields); the first report stays")
    public AiJobDto outcome(@PathVariable long id, @RequestBody AiJob.Outcome body) {
        return jobs.outcome(id, body);
    }

    @PostMapping("/estimate")
    @Operation(summary = "How long a task will take and, for the finance right, what it will cost")
    public AiJobs.EstimateDto estimate(@RequestBody AiJobs.EstimateRequest body) {
        return jobs.estimate(body);
    }
}
