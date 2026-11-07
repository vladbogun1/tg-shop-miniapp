package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.ai.app.AiJobDto;
import com.maxsolch.shop.ai.app.ManualBatchDto;
import com.maxsolch.shop.catalog.app.CardManualAi;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * «Через ChatGPT вручную» for cards: the pasted answers become tasks of «ИИ-задачи» (no model call, works with the AI
 * switched off). The review, «Принять безопасное», the undo and the outcome are the AI tasks API.
 */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin Cards manual AI", description = "The manual way through ChatGPT for cards, as tasks")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCardManualController {

    private final CardManualAi manual;

    public AdminCardManualController(CardManualAi manual) {
        this.manual = manual;
    }

    @PostMapping("/card-manual-batches")
    @Operation(summary = "Start a manual batch of the picked products (up to 100, parts of 1–8). 409 "
            + "AI_MANUAL_BATCH_OPEN (batchId) when the admin already has an open one")
    public ManualBatchDto start(@RequestBody CardManualAi.ManualCardBatchStart body) {
        return manual.start(body);
    }

    @GetMapping("/card-manual-batches/current")
    @Operation(summary = "The admin's open manual batch, to continue it on any device; 204 when there is none")
    public ResponseEntity<ManualBatchDto> current() {
        return manual.current().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/card-manual-batches/{id}")
    @Operation(summary = "A manual batch: its jobs, products, part size and the screen's draft")
    public ManualBatchDto get(@PathVariable long id) {
        return manual.get(id);
    }

    @PutMapping("/card-manual-batches/{id}/draft")
    @Operation(summary = "Save the screen's draft (JSON, up to 1 MB) of the admin's open manual batch")
    public ManualBatchDto saveDraft(@PathVariable long id, @RequestBody CardManualAi.ManualDraft body) {
        return manual.saveDraft(id, body == null ? null : body.draft());
    }

    @PostMapping("/card-manual-batches/{id}/answers")
    @Operation(summary = "The answers of one part become tasks (a pending one gets the newer answer; a decided one "
            + "stays); the products of the part without an answer lose their pending task")
    public ManualBatchDto answers(@PathVariable long id, @RequestBody CardManualAi.ManualCardPart body) {
        return manual.answers(id, body);
    }

    @PostMapping("/card-manual-batches/{id}/finish")
    @Operation(summary = "«Закончить»: the batch is done; undecided answers stay in «ИИ-задачи → Проверить»")
    public ManualBatchDto finish(@PathVariable long id) {
        return manual.finish(id);
    }

    @DeleteMapping("/card-manual-batches/{id}")
    @Operation(summary = "«Удалить»: the batch is canceled and its undecided answers go away; applied stays applied")
    public ManualBatchDto discard(@PathVariable long id) {
        return manual.discard(id);
    }

    @PostMapping("/card-manual-jobs")
    @Operation(summary = "The answer pasted for one product becomes a task waiting for the review (replaces the "
            + "admin's undecided answer for the same product)")
    public AiJobDto single(@RequestBody CardManualAi.ManualCardPaste body) {
        return manual.single(body);
    }
}
