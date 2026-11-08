package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.AcceptRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.AcceptResult;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.CreateRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftDto;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.SaveRequest;
import com.maxsolch.shop.procurement.app.SupplyDrafts;
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

import java.util.List;

/** «Поставка с ИИ» as a server draft: the AI reads, matches and makes cards on its own; the admin checks and accepts. */
@RestController
@RequestMapping("/api/admin/supply-drafts")
@RequiredAdmin
@Tag(name = "Admin Preorders", description = "Supply batches, pre-order queues and demand")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSupplyDraftController {

    private final SupplyDrafts drafts;

    public AdminSupplyDraftController(SupplyDrafts drafts) {
        this.drafts = drafts;
    }

    @GetMapping
    @Operation(summary = "Open supply drafts (own; all of them with the finance right)")
    public List<DraftSummary> list() {
        return drafts.list();
    }

    @PostMapping
    @Operation(summary = "Create a draft from invoice pictures and start the AI")
    public DraftDto create(@RequestBody CreateRequest req) {
        return drafts.create(req.fileIds());
    }

    @GetMapping("/{id}")
    @Operation(summary = "A draft with its AI progress")
    public DraftDto get(@PathVariable long id) {
        return drafts.get(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Save the corrections of the check screen (409 DRAFT_CHANGED for an older version)")
    public DraftDto save(@PathVariable long id, @RequestBody SaveRequest req) {
        return drafts.save(id, req);
    }

    @PostMapping("/{id}/retry")
    @Operation(summary = "Read again / let the AI finish what is missing")
    public DraftDto retry(@PathVariable long id) {
        return drafts.retry(id);
    }

    @PostMapping("/{id}/stop")
    @Operation(summary = "Stop the AI of a running draft")
    public DraftDto stop(@PathVariable long id) {
        return drafts.stop(id);
    }

    @PostMapping("/{id}/accept")
    @Operation(summary = "Create the supplier, new products, the batch and the supplier memory")
    public AcceptResult accept(@PathVariable long id, @RequestBody AcceptRequest req) {
        return drafts.accept(id, req.version());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a draft that did not become a batch")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        drafts.delete(id);
        return ResponseEntity.noContent().build();
    }
}
