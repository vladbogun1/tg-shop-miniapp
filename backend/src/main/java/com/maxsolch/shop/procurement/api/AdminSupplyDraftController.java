package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftAcceptRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftAcceptResult;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftCreateRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftDto;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSaveRequest;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.SameInvoice;
import com.maxsolch.shop.procurement.app.SupplyDraftDuplicates;
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
import org.springframework.web.bind.annotation.RequestParam;
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
    private final SupplyDraftDuplicates duplicates;

    public AdminSupplyDraftController(SupplyDrafts drafts, SupplyDraftDuplicates duplicates) {
        this.drafts = drafts;
        this.duplicates = duplicates;
    }

    @GetMapping
    @Operation(summary = "Open supply drafts (own; all of them with the finance right)")
    public List<DraftSummary> list() {
        return drafts.list();
    }

    @GetMapping("/same-invoice")
    @Operation(summary = "Drafts (open or accepted, of the last 7 days) that already have these invoice files uploaded again")
    public List<SameInvoice> sameInvoice(@RequestParam List<Long> fileIds) {
        return duplicates.sameInvoice(fileIds);
    }

    @PostMapping
    @Operation(summary = "Create a draft from invoice pictures and start the AI")
    public DraftDto create(@RequestBody DraftCreateRequest req) {
        return drafts.create(req.fileIds());
    }

    @GetMapping("/{id}")
    @Operation(summary = "A draft with its AI progress")
    public DraftDto get(@PathVariable long id) {
        return drafts.get(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Save the corrections of the check screen (409 DRAFT_CHANGED for an older version)")
    public DraftDto save(@PathVariable long id, @RequestBody DraftSaveRequest req) {
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
    public DraftAcceptResult accept(@PathVariable long id, @RequestBody DraftAcceptRequest req) {
        return drafts.accept(id, req.version());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a draft that did not become a batch")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        drafts.delete(id);
        return ResponseEntity.noContent().build();
    }
}
