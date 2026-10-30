package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.AdminBatches;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveResult;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchDto;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchSummaryDto;
import com.maxsolch.shop.procurement.app.BatchDtos.CancelRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.StatusRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierDto;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * «Поставки» in the admin: batches from factories and suppliers. Purchase prices and the exchange rate are shown
 * and accepted only for the main admin and admins with «Финансы». The queues of the lines live in the pre-order
 * controller under the same prefix.
 */
@RestController
@RequestMapping("/api/admin/preorders")
@RequiredAdmin
@Tag(name = "Admin Preorders", description = "Supply batches, pre-order queues and demand")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBatchController {

    private final AdminBatches batches;
    private final AdminAccess adminAccess;
    private final CurrentActor actor;

    public AdminBatchController(AdminBatches batches, AdminAccess adminAccess, CurrentActor actor) {
        this.batches = batches;
        this.adminAccess = adminAccess;
        this.actor = actor;
    }

    @GetMapping("/batches")
    @Operation(summary = "Batches: filter open (default) | arrived | cancelled | all")
    public List<BatchSummaryDto> list(@RequestParam(defaultValue = "open") String filter) {
        return batches.list(filter);
    }

    @GetMapping("/batches/{id}")
    @Operation(summary = "A batch with its lines and queues")
    public BatchDto get(@PathVariable long id) {
        return batches.get(id, money());
    }

    @PostMapping("/batches")
    @Operation(summary = "New batch (ordered from a factory)")
    public BatchDto create(@RequestBody BatchRequest req) {
        return batches.create(req, money());
    }

    @PutMapping("/batches/{id}")
    @Operation(summary = "Edit a batch: ETA, notes, lines (lines only before arrival)")
    public BatchDto update(@PathVariable long id, @RequestBody BatchRequest req) {
        return batches.update(id, req, money());
    }

    @PostMapping("/batches/{id}/status")
    @Operation(summary = "Move an open batch: ORDERED / IN_TRANSIT / CUSTOMS")
    public BatchDto status(@PathVariable long id, @RequestBody StatusRequest req) {
        return batches.setStatus(id, req == null ? null : req.status(), money());
    }

    @PostMapping("/batches/{id}/arrive")
    @Operation(summary = "«Приехала»: add stock, set prices, hand out holds; dryRun=true only previews")
    public ArriveResult arrive(@PathVariable long id, @RequestBody ArriveRequest req) {
        return batches.arrive(id, req);
    }

    @PostMapping("/batches/{id}/cancel")
    @Operation(summary = "Cancel a batch; closeQueue=true also closes the queues of its lines")
    public BatchDto cancel(@PathVariable long id, @RequestBody(required = false) CancelRequest req) {
        return batches.cancel(id, req, money());
    }

    @GetMapping("/suppliers")
    @Operation(summary = "Suppliers (factories)")
    public List<SupplierDto> suppliers() {
        return batches.suppliers();
    }

    @PostMapping("/suppliers")
    @Operation(summary = "New supplier")
    public SupplierDto createSupplier(@RequestBody SupplierRequest req) {
        return batches.createSupplier(req);
    }

    private boolean money() {
        return actor.principalIfPresent().map(adminAccess::canSeeFinance).orElse(false);
    }
}
