package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiAgent;
import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.app.AiStatusReport;
import com.maxsolch.shop.ai.app.WebSearch;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The built-in AI (instead of copying prompts to ChatGPT): start a question in the background, poll it, see the
 * month's spend and the search providers.
 */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin AI", description = "Built-in AI: background questions with web research, spend and providers")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiController {

    private final AiJobs jobs;
    private final AiStatusReport status;

    public AdminAiController(AiJobs jobs, AiStatusReport status) {
        this.jobs = jobs;
        this.status = status;
    }

    public record SearchTestRequest(String query) {
    }

    @PostMapping("/jobs")
    @Operation(summary = "Start a question: the prompt as built for copying; researchItems > 0 gives the model "
            + "search/open_page with a budget per item. Answers at once with a RUNNING job")
    public AiJobs.JobView start(@RequestBody AiAgent.Ask body) {
        return jobs.start(body);
    }

    @GetMapping("/jobs/{id}")
    @Operation(summary = "The job: RUNNING, or DONE with the answer; a failed job answers with its error")
    public AiJobs.JobView job(@PathVariable String id) {
        return jobs.get(id);
    }

    @GetMapping("/status")
    @Operation(summary = "Is the model configured, search providers (on / resting after a failure), this month's "
            + "spend by provider and result (OK / EMPTY / FAILED)")
    public AiStatusReport.AiStatus status() {
        return status.status();
    }

    @PostMapping("/search-test")
    @Operation(summary = "One query through the search chain, as the model gets it")
    public WebSearch.Found searchTest(@RequestBody SearchTestRequest body) {
        return status.testSearch(body.query());
    }
}
