package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchMoneyDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.RateDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ReconcileDto;
import com.maxsolch.shop.procurement.domain.BatchExpenseFile;
import com.maxsolch.shop.procurement.domain.NbuRates;
import org.springframework.stereotype.Service;
import com.maxsolch.shop.platform.web.UploadedFile;

import java.io.InputStream;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * What the finance admin does with batch money, one method per button (the «Финансы» right is checked by {@code @RequiresFinance} on the controller): runs the
 * scenario of {@link CostingService} / {@link StockLotCosting} and writes the audit entry. The margin reports are in
 * {@code finance.app.AdminMargin}. Not {@code @Transactional}: each audit entry is written on its own after the
 * transaction of the scenario has committed.
 */
@Service
public class AdminCosting {

    /** An expense document ready to be streamed; the caller closes the stream. */
    public record ExpenseDocument(String fileName, String contentType, InputStream stream) {
    }

    private final CostingService costing;
    private final StockLotCosting lots;
    private final NbuRates nbu;
    private final AdminAccess access;
    private final CurrentActor actor;
    private final AdminAuditService audit;
    private final ImageStorageService storage;
    private final UploadValidator uploads;
    private final Clock clock;
    private final ShopZone shopZone;

    public AdminCosting(CostingService costing, StockLotCosting lots, NbuRates nbu, AdminAccess access, CurrentActor actor,
                        AdminAuditService audit, ImageStorageService storage, UploadValidator uploads, Clock clock,
                        ShopZone shopZone) {
        this.costing = costing;
        this.lots = lots;
        this.nbu = nbu;
        this.access = access;
        this.actor = actor;
        this.audit = audit;
        this.storage = storage;
        this.uploads = uploads;
        this.clock = clock;
        this.shopZone = shopZone;
    }

    /** May the caller see money (the main admin or «Финансы»). */
    public boolean canSeeFinance() {
        return access.canSeeFinance(actor.userId());
    }

    public BatchMoneyDto money(long batchId) {
        return costing.money(batchId);
    }

    public BatchMoneyDto saveMoney(long batchId, MoneyRequest req) {
        BatchMoneyDto dto = costing.saveMoney(batchId, req);
        audit.record("COSTING_BATCH_MONEY", "PREORDER_BATCH", String.valueOf(batchId),
                dto.currency() + " · курс " + dto.fxRate() + " · " + dto.allocation()
                        + (dto.costsFinal() ? " · расходы внесены" : ""));
        return dto;
    }

    public BatchMoneyDto addExpense(long batchId, ExpenseRequest req) {
        BatchMoneyDto dto = costing.addExpense(batchId, req, audit.currentAdminName());
        audit.record("COSTING_EXPENSE_ADD", "PREORDER_BATCH", String.valueOf(batchId), describe(req));
        return dto;
    }

    public BatchMoneyDto updateExpense(long expenseId, ExpenseRequest req) {
        BatchMoneyDto dto = costing.updateExpense(expenseId, req);
        audit.record("COSTING_EXPENSE_EDIT", "BATCH_EXPENSE", String.valueOf(expenseId), describe(req));
        return dto;
    }

    public BatchMoneyDto deleteExpense(long expenseId) {
        BatchMoneyDto dto = costing.deleteExpense(expenseId);
        audit.record("COSTING_EXPENSE_DELETE", "BATCH_EXPENSE", String.valueOf(expenseId), "удалён");
        return dto;
    }

    public BatchMoneyDto addExpenseFile(long expenseId, UploadedFile file) {
        uploads.validateAttachment(file);
        BatchMoneyDto dto = costing.addExpenseFile(expenseId, file, audit.currentAdminName());
        audit.record("COSTING_EXPENSE_FILE_ADD", "BATCH_EXPENSE", String.valueOf(expenseId),
                String.valueOf(file.getOriginalFilename()));
        return dto;
    }

    /** The bytes of an expense document; 404 when the row exists but the storage lost the file. */
    public ExpenseDocument expenseFile(long fileId) {
        BatchExpenseFile f = costing.expenseFile(fileId);
        ImageStorageService.StoredObject o = storage.get(f.getObjectKey());
        if (o == null) {
            throw new DomainException.NotFound(ProcurementError.DOCUMENT_FILE_NOT_FOUND);
        }
        return new ExpenseDocument(f.getFileName(), o.contentType() != null ? o.contentType() : f.getContentType(),
                o.stream());
    }

    public BatchMoneyDto deleteExpenseFile(long fileId) {
        BatchExpenseFile f = costing.expenseFile(fileId);
        BatchMoneyDto dto = costing.deleteExpenseFile(fileId);
        audit.record("COSTING_EXPENSE_FILE_DELETE", "BATCH_EXPENSE", String.valueOf(f.getExpenseId()),
                f.getFileName());
        return dto;
    }

    /** The official NBU rate for a date (today in Kyiv when none): a hint, the admin may type his own. */
    public RateDto nbuRate(String currency, LocalDate date) {
        LocalDate d = date != null ? date : shopZone.today(clock);
        String c = currency.trim().toUpperCase(Locale.ROOT);
        return new RateDto(c, d, nbu.rate(c, d));
    }

    public ProductCostDto product(String productId) {
        return lots.product(productId);
    }

    public List<OpeningRowDto> opening() {
        return lots.opening();
    }

    public List<OpeningRowDto> setOpening(OpeningRequest req) {
        lots.setOpening(req);
        audit.record("COSTING_OPENING", "PRODUCT", req.productId(),
                (req.variantId() == null ? "" : "вариант " + req.variantId() + ": ")
                        + (req.unitCostMinor() == null ? "очищено" : req.unitCostMinor() / 100.0 + " ₴"));
        return lots.opening();
    }

    public ReconcileDto reconcile() {
        ReconcileDto r = lots.reconcile();
        audit.record("COSTING_RECONCILE", "STOCK", "all", "выровнено ключей: " + r.fixed());
        return r;
    }

    private static String describe(ExpenseRequest r) {
        if (r == null) {
            return "";
        }
        return (r.kind() == null ? "OTHER" : r.kind()) + " " + (r.amountMinor() == null ? 0 : r.amountMinor() / 100.0)
                + " " + (r.currency() == null ? "UAH" : r.currency())
                + (r.note() == null || r.note().isBlank() ? "" : " · " + r.note().trim());
    }
}
