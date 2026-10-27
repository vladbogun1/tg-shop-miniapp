package com.maxsolch.shop.preorder;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveRequest;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveResult;
import com.maxsolch.shop.preorder.PreorderDtos.BatchDto;
import com.maxsolch.shop.preorder.PreorderDtos.BatchRequest;
import com.maxsolch.shop.preorder.PreorderDtos.BatchSummaryDto;
import com.maxsolch.shop.preorder.PreorderDtos.CancelRequest;
import com.maxsolch.shop.preorder.PreorderDtos.DemandDto;
import com.maxsolch.shop.preorder.PreorderDtos.ReleaseRequest;
import com.maxsolch.shop.preorder.PreorderDtos.ReleaseResult;
import com.maxsolch.shop.preorder.PreorderDtos.StatusRequest;
import com.maxsolch.shop.preorder.PreorderDtos.SubscriberDto;
import com.maxsolch.shop.preorder.PreorderDtos.SupplierDto;
import com.maxsolch.shop.preorder.PreorderDtos.SupplierRequest;
import com.maxsolch.shop.security.AdminAccess;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.site.SiteRevalidator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
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

/**
 * «Поставки» in the admin: batches from factories, their queues, «Приехала», «Чего ждут». Purchase prices
 * and the exchange rate are shown and accepted only for the main admin.
 */
@RestController
@RequestMapping("/api/admin/preorders")
@RequiredAdmin
@Tag(name = "Admin Preorders", description = "Supply batches, pre-order queues and demand")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPreorderController {

    private final PreorderBatchService service;
    private final AdminAccess adminAccess;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;

    public AdminPreorderController(PreorderBatchService service, AdminAccess adminAccess, AdminAuditService audit,
                                   SiteRevalidator siteRevalidator) {
        this.service = service;
        this.adminAccess = adminAccess;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    @GetMapping("/batches")
    @Operation(summary = "Batches: filter open (default) | arrived | cancelled | all")
    public List<BatchSummaryDto> list(@RequestParam(defaultValue = "open") String filter) {
        return service.list(filter);
    }

    @GetMapping("/batches/{id}")
    @Operation(summary = "A batch with its lines and queues")
    public BatchDto get(@PathVariable long id) {
        return service.get(id, money());
    }

    @PostMapping("/batches")
    @Operation(summary = "New batch (ordered from a factory)")
    public BatchDto create(@RequestBody BatchRequest req) {
        BatchDto dto = service.create(req, audit.currentAdminName(), money());
        audit.record("PREORDER_BATCH_CREATE", "PREORDER_BATCH", String.valueOf(dto.id()),
                dto.title() + ", позиций: " + dto.items().size());
        return dto;
    }

    @PutMapping("/batches/{id}")
    @Operation(summary = "Edit a batch: ETA, notes, lines (lines only before arrival)")
    public BatchDto update(@PathVariable long id, @RequestBody BatchRequest req) {
        BatchDto dto = service.update(id, req, money());
        audit.record("PREORDER_BATCH_UPDATE", "PREORDER_BATCH", String.valueOf(id), dto.title());
        return dto;
    }

    @PostMapping("/batches/{id}/status")
    @Operation(summary = "Move an open batch: ORDERED / IN_TRANSIT / CUSTOMS")
    public BatchDto status(@PathVariable long id, @RequestBody StatusRequest req) {
        BatchDto dto = service.setStatus(id, req == null ? null : req.status(), money());
        audit.record("PREORDER_BATCH_STATUS", "PREORDER_BATCH", String.valueOf(id), dto.status());
        return dto;
    }

    @PostMapping("/batches/{id}/arrive")
    @Operation(summary = "«Приехала»: add stock, set prices, hand out holds; dryRun=true only previews")
    public ArriveResult arrive(@PathVariable long id, @RequestBody ArriveRequest req) {
        ArriveResult result = service.arrive(id, req);
        if (!result.dryRun()) {
            int units = result.lines().stream().mapToInt(PreorderDtos.ArriveLineResult::arrived).sum();
            int held = result.lines().stream().mapToInt(PreorderDtos.ArriveLineResult::heldPeople).sum();
            audit.record("PREORDER_BATCH_ARRIVE", "PREORDER_BATCH", String.valueOf(id),
                    "приехало " + units + " шт., бронь у " + held + " чел., " + result.distribution());
            siteRevalidator.allChanged();
        }
        return result;
    }

    @PostMapping("/batches/{id}/cancel")
    @Operation(summary = "Cancel a batch; closeQueue=true also closes the queues of its lines")
    public BatchDto cancel(@PathVariable long id, @RequestBody(required = false) CancelRequest req) {
        BatchDto dto = service.cancel(id, req, money());
        audit.record("PREORDER_BATCH_CANCEL", "PREORDER_BATCH", String.valueOf(id),
                req != null && Boolean.TRUE.equals(req.closeQueue()) ? "с закрытием очереди" : "очередь оставлена");
        return dto;
    }

    @GetMapping("/batches/{id}/subscribers")
    @Operation(summary = "Who waits for the lines of a batch")
    public List<SubscriberDto> batchSubscribers(@PathVariable long id) {
        return service.subscribersOfBatch(id);
    }

    @GetMapping("/subscribers")
    @Operation(summary = "Who waits for a product (all variants), live first")
    public List<SubscriberDto> productSubscribers(@RequestParam String productId) {
        return service.subscribersOfProduct(productId);
    }

    @DeleteMapping("/subscriptions/{id}")
    @Operation(summary = "Remove a person from a queue (a held unit goes to the next one)")
    public ResponseEntity<Void> removeSubscriber(@PathVariable long id) {
        service.removeSubscriber(id, audit.currentAdminName());
        audit.record("PREORDER_SUBSCRIPTION_REMOVE", "PREORDER_SUBSCRIPTION", String.valueOf(id), null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/demand")
    @Operation(summary = "«Чего ждут»: lines with people in the queue, most wanted first")
    public List<DemandDto> demand() {
        return service.demand();
    }

    @PostMapping("/demand/release")
    @Operation(summary = "Hand out holds after a restock outside a batch")
    public ReleaseResult release(@RequestBody ReleaseRequest req) {
        ReleaseResult result = service.release(req);
        audit.record("PREORDER_RELEASE", "PRODUCT", req.productId(),
                "бронь у " + result.heldPeople() + " чел., " + result.heldQty() + " шт.");
        return result;
    }

    @GetMapping("/suppliers")
    @Operation(summary = "Suppliers (factories)")
    public List<SupplierDto> suppliers() {
        return service.suppliers();
    }

    @PostMapping("/suppliers")
    @Operation(summary = "New supplier")
    public SupplierDto createSupplier(@RequestBody SupplierRequest req) {
        SupplierDto dto = service.createSupplier(req);
        audit.record("PREORDER_SUPPLIER_CREATE", "SUPPLIER", String.valueOf(dto.id()), dto.name());
        return dto;
    }

    /** Purchase prices and the exchange rate — the main admin and admins with «Финансы». */
    private boolean money() {
        return adminAccess.canSeeFinance(SecurityContextHolder.getContext().getAuthentication());
    }
}
