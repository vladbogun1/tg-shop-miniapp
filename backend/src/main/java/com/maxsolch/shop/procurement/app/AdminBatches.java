package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveLineResult;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveResult;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchDto;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchSummaryDto;
import com.maxsolch.shop.procurement.app.BatchDtos.CancelRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierDto;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierRequest;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * What the admin does with batches and suppliers, one method per button: runs the scenario of
 * {@link PreorderBatchService} and writes the audit entry after its transaction has committed. The controller only
 * turns the request into these arguments. Not {@code @Transactional}: the audit entries are written on their own.
 */
@Service
public class AdminBatches {

    private final PreorderBatchService batches;
    private final SupplierService supplierService;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;

    public AdminBatches(PreorderBatchService batches, SupplierService supplierService, AdminAuditService audit, SiteRevalidator siteRevalidator) {
        this.batches = batches;
        this.supplierService = supplierService;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    public List<BatchSummaryDto> list(String filter) {
        return batches.list(filter);
    }

    public BatchDto get(long id, boolean money) {
        return batches.get(id, money);
    }

    public BatchDto create(BatchRequest req, boolean money) {
        BatchDto dto = batches.create(req, audit.currentAdminName(), money);
        audit.record("PREORDER_BATCH_CREATE", "PREORDER_BATCH", String.valueOf(dto.id()),
                dto.title() + ", позиций: " + dto.items().size());
        return dto;
    }

    public BatchDto update(long id, BatchRequest req, boolean money) {
        BatchDto dto = batches.update(id, req, money);
        audit.record("PREORDER_BATCH_UPDATE", "PREORDER_BATCH", String.valueOf(id), dto.title());
        return dto;
    }

    public BatchDto setStatus(long id, String status, boolean money) {
        BatchDto dto = batches.setStatus(id, status, money);
        audit.record("PREORDER_BATCH_STATUS", "PREORDER_BATCH", String.valueOf(id), dto.status());
        return dto;
    }

    /** «Приехала»; a dry run only previews and is not audited. */
    public ArriveResult arrive(long id, ArriveRequest req) {
        ArriveResult result = batches.arrive(id, req);
        if (!result.dryRun()) {
            int units = result.lines().stream().mapToInt(ArriveLineResult::arrived).sum();
            int held = result.lines().stream().mapToInt(ArriveLineResult::heldPeople).sum();
            audit.record("PREORDER_BATCH_ARRIVE", "PREORDER_BATCH", String.valueOf(id),
                    "приехало " + units + " шт., бронь у " + held + " чел., " + result.distribution());
            siteRevalidator.allChanged();
        }
        return result;
    }

    public BatchDto cancel(long id, CancelRequest req, boolean money) {
        BatchDto dto = batches.cancel(id, req, money);
        audit.record("PREORDER_BATCH_CANCEL", "PREORDER_BATCH", String.valueOf(id),
                req != null && Boolean.TRUE.equals(req.closeQueue()) ? "с закрытием очереди" : "очередь оставлена");
        return dto;
    }

    public List<SupplierDto> suppliers() {
        return supplierService.suppliers();
    }

    public SupplierDto createSupplier(SupplierRequest req) {
        SupplierDto dto = supplierService.createSupplier(req);
        audit.record("PREORDER_SUPPLIER_CREATE", "SUPPLIER", String.valueOf(dto.id()), dto.name());
        return dto;
    }
}
