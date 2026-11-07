package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.ai.app.AiJobDto;
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

    public AdminCardAiController(CardAiJobs cardJobs) {
        this.cardJobs = cardJobs;
    }

    @PostMapping("/card-jobs")
    @Operation(summary = "Fill in the card of one product: medium effort and the research budget of one product are "
            + "fixed here; the same answers as POST /ai/jobs (409 AI_JOB_ACTIVE, Idempotency-Key)")
    public AiJobDto start(@RequestBody CardAiJobs.Start body,
                          @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return cardJobs.start(body, idempotencyKey);
    }
}
