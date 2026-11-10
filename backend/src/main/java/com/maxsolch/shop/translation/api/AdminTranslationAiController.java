package com.maxsolch.shop.translation.api;

import com.maxsolch.shop.ai.app.AiBatchDto;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.translation.app.AiTranslationJobs;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Перевести с ИИ»: the translations screen starts the batch here, everything else is the AI batches API. */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin Translations AI", description = "Start the AI translation of rows of the translations screen")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTranslationAiController {

    private final AiTranslationJobs jobs;

    public AdminTranslationAiController(AiTranslationJobs jobs) {
        this.jobs = jobs;
    }

    @PostMapping("/translation-batches")
    @RequiredSuperAdmin
    @Operation(summary = "Translate rows with the built-in AI: one task per part of at most 60 strings, medium effort. "
            + "The result is written as drafts of the AI (a manual translation is never replaced). 409 AI_JOB_ACTIVE "
            + "(subjects) for a part that is already running, AI_BATCHES_OFF when batches are switched off; the same "
            + "Idempotency-Key returns the first batch")
    public AiBatchDto start(@RequestBody AiTranslationJobs.Start body,
                            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return jobs.start(body, idempotencyKey);
    }
}
