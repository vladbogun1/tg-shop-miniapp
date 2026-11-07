package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiApplyUndo;
import com.maxsolch.shop.ai.app.AiBatchControls;
import com.maxsolch.shop.ai.app.AiBatchDto;
import com.maxsolch.shop.ai.app.AiBatchEstimate;
import com.maxsolch.shop.ai.app.AiBatches;
import com.maxsolch.shop.ai.app.AiSafeAccept;
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
 * Batches of AI tasks (a batch of products is started from the catalog: {@code POST /api/admin/ai/card-batches}):
 * the estimate before the start, the bar of running batches, pause / continue / stop, «Повторить неудачные», and
 * «Принять безопасное» with its 24 hours of undo. For any admin; an admin sees the counts and the minutes, only the
 * finance right sees the money.
 */
@RestController
@RequestMapping("/api/admin/ai")
@RequiredAdmin
@Tag(name = "Admin AI batches", description = "Batches of AI tasks: estimate, bar, pause/continue/stop, retry, safe accept, undo")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiBatchesController {

    private final AiBatches batches;
    private final AiBatchControls controls;
    private final AiSafeAccept safe;
    private final AiApplyUndo undo;

    public AdminAiBatchesController(AiBatches batches, AiBatchControls controls, AiSafeAccept safe, AiApplyUndo undo) {
        this.batches = batches;
        this.controls = controls;
        this.safe = safe;
        this.undo = undo;
    }

    @PostMapping("/batches/estimate")
    @Operation(summary = "How long a batch of N objects takes, and whether the limit left is enough; the money fields "
            + "only for the finance right")
    public AiBatchEstimate.Dto estimate(@RequestBody AiBatches.EstimateRequest body) {
        return batches.estimate(body);
    }

    @GetMapping("/batches/active")
    @Operation(summary = "The bar: running and paused batches of everybody, and the finished ones of this admin with "
            + "something left to do (results to review, failed ones, applications that can be undone)")
    public List<AiBatchDto> active() {
        return batches.active();
    }

    @GetMapping("/batches/{id}")
    @Operation(summary = "A batch with the counts and a row per job")
    public AiBatchDto batch(@PathVariable long id) {
        return batches.get(id);
    }

    @PostMapping("/batches/{id}/pause")
    @Operation(summary = "Pause: queued jobs wait, running ones finish. The one who started it, or the finance right")
    public AiBatchDto pause(@PathVariable long id) {
        return controls.pause(id);
    }

    @PostMapping("/batches/{id}/resume")
    @Operation(summary = "Continue a paused batch; 409 while a limit is used up or the AI is off")
    public AiBatchDto resume(@PathVariable long id) {
        return controls.resume(id);
    }

    @PostMapping("/batches/{id}/cancel")
    @Operation(summary = "Stop for good: queued jobs end at once, running ones before the next model turn; ready results stay")
    public AiBatchDto cancel(@PathVariable long id) {
        return controls.cancel(id);
    }

    @PostMapping("/batches/{id}/retry-failed")
    @Operation(summary = "A new batch for the failed, empty or unreadable jobs not asked again; 409 when there are none")
    public AiBatchDto retryFailed(@PathVariable long id,
                                  @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return controls.retryFailed(id, idempotencyKey);
    }

    @PostMapping("/batches/jobs/{jobId}/apply/begin")
    @Operation(summary = "Before the screen applies the result of a batch job safely: the values of the object are "
            + "taken; 409 AI_NOT_SAFE when the job is not eligible (no search, already decided or applied)")
    public AiSafeAccept.Begun begin(@PathVariable long jobId) {
        return safe.begin(jobId);
    }

    @PostMapping("/apply/{applyId}/finish")
    @Operation(summary = "After the card is saved: the changed fields are compared and checked (only empty "
            + "characteristics and description filled). A broken promise is given back at once and listed in notSafe")
    public AiSafeAccept.Applied finish(@PathVariable long applyId) {
        return safe.finish(applyId);
    }

    @PostMapping("/apply/{applyId}/undo")
    @Operation(summary = "Undo one application within 24 hours; fields edited by hand since stay (counted as skipped)")
    public AiApplyUndo.Result undoOne(@PathVariable long applyId) {
        return undo.undo(applyId);
    }

    @PostMapping("/batches/{id}/accept-safe/undo")
    @Operation(summary = "«Отменить применение»: undo every safe application of the batch that is still inside 24 hours")
    public AiApplyUndo.Result undoBatch(@PathVariable long id) {
        return undo.undoBatch(id);
    }
}
