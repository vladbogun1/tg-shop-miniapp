package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.AiSupplyJobs;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Прочитать с ИИ» in the supply; the task is then polled like any other (`GET /api/admin/ai/jobs/{id}`). */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin Supply AI", description = "Read uploaded invoice pictures with the built-in AI")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiSupplyController {

    private final AiSupplyJobs supply;

    public AdminAiSupplyController(AiSupplyJobs supply) {
        this.supply = supply;
    }

    @PostMapping("/supply-jobs")
    @Operation(summary = "Read my uploaded pictures (1 to 10, ids from POST /files) with the AI: one task, low effort, no "
            + "web search; the answer is the invoice json of the manual prompt. Any admin of the supply; the answer "
            + "(purchase prices) is shown to the admin who started it and to admins with the finance right, the price of "
            + "the task only to the latter. 409 AI_JOB_ACTIVE for the same set, 409 AI_FILES_GONE for expired "
            + "pictures, 404 AI_FILE_NOT_FOUND for a foreign or used one; the same Idempotency-Key returns the first task")
    public AiJobDto start(@RequestBody AiSupplyJobs.Start body,
                          @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return supply.start(body, idempotencyKey);
    }
}
