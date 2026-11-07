package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.ai.app.AiBatchDto;
import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.catalog.app.CardAiBatches;
import com.maxsolch.shop.catalog.app.CardAiJobs;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** "Fill in the card with AI" for one product: the card screens start the task here, everything else is the AI tasks API. */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin Cards AI", description = "Start the AI task for the card of one product")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCardAiController {

    private final CardAiJobs cardJobs;
    private final CardAiBatches cardBatches;

    public AdminCardAiController(CardAiJobs cardJobs, CardAiBatches cardBatches) {
        this.cardJobs = cardJobs;
        this.cardBatches = cardBatches;
    }

    @PostMapping("/card-jobs")
    @Operation(summary = "Fill in the card of one product: medium effort and the research budget of one product are "
            + "fixed here; the same answers as POST /ai/jobs (409 AI_JOB_ACTIVE, Idempotency-Key)")
    public AiJobDto start(@RequestBody CardAiJobs.Start body,
                          @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return cardJobs.start(body, idempotencyKey);
    }

    @PostMapping("/card-batches")
    @Operation(summary = "Fill in the cards of several products (up to the batch maximum, 30) as one batch: one task "
            + "per product, medium effort. 409 AI_JOB_ACTIVE (subjects) when a product already has an active task, "
            + "AI_BATCHES_OFF when the owner switched batches off; the same Idempotency-Key returns the first batch")
    public AiBatchDto startBatch(@RequestBody CardAiBatches.Start body,
                                 @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return cardBatches.start(body, idempotencyKey);
    }
}
