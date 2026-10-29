package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.procurement.app.AdminCosting;
import com.maxsolch.shop.procurement.app.AdminCosting.ExpenseDocument;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchMoneyDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.RateDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ReconcileDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Purchase prices, batch expenses and cost of goods (docs/PREORDERS-PLAN.md §5А). Every endpoint is for the main
 * admin and admins with «Финансы»; changes go to the admin journal. The margin screens of the same prefix are in
 * {@code finance.api.AdminMarginController}.
 */
@RestController
@RequestMapping("/api/admin/costing")
@RequiredAdmin
@Tag(name = "Admin Costing", description = "Batch money, FIFO cost of goods, margin")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCostingController {

    private final AdminCosting costing;

    public AdminCostingController(AdminCosting costing) {
        this.costing = costing;
    }

    @GetMapping("/access")
    @Operation(summary = "May the caller see money (the main admin or «Финансы»)")
    public Map<String, Boolean> canSee() {
        return Map.of("finance", costing.canSeeFinance());
    }

    // ----- batch money

    @GetMapping("/batches/{id}")
    @Operation(summary = "Batch money: purchase, rate, expenses, cost per unit and margin")
    public BatchMoneyDto money(@PathVariable long id) {
        return costing.money(id);
    }

    @PutMapping("/batches/{id}")
    @Operation(summary = "Save currency, rate, allocation, «Все расходы внесены» and line prices / weights")
    public BatchMoneyDto saveMoney(@PathVariable long id, @RequestBody MoneyRequest req) {
        return costing.saveMoney(id, req);
    }

    @PostMapping("/batches/{id}/expenses")
    @Operation(summary = "Add an expense to the batch (or to one line)")
    public BatchMoneyDto addExpense(@PathVariable long id, @RequestBody ExpenseRequest req) {
        return costing.addExpense(id, req);
    }

    @PutMapping("/expenses/{expenseId}")
    @Operation(summary = "Edit an expense")
    public BatchMoneyDto updateExpense(@PathVariable long expenseId, @RequestBody ExpenseRequest req) {
        return costing.updateExpense(expenseId, req);
    }

    @DeleteMapping("/expenses/{expenseId}")
    @Operation(summary = "Delete an expense")
    public BatchMoneyDto deleteExpense(@PathVariable long expenseId) {
        return costing.deleteExpense(expenseId);
    }

    @PostMapping(value = "/expenses/{expenseId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Attach a document to an expense: a photo or a PDF (invoice, declaration, statement)")
    public BatchMoneyDto addExpenseFile(@PathVariable long expenseId, @RequestParam("file") MultipartFile file) {
        return costing.addExpenseFile(expenseId, file);
    }

    @GetMapping("/expense-files/{fileId}")
    @Operation(summary = "The bytes of an expense document (inline; «Финансы» only)")
    public ResponseEntity<InputStreamResource> expenseFile(@PathVariable long fileId) {
        ExpenseDocument doc = costing.expenseFile(fileId);
        MediaType type;
        try {
            type = MediaType.parseMediaType(doc.contentType());
        } catch (RuntimeException e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .contentType(type)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(doc.fileName(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(doc.stream()));
    }

    @DeleteMapping("/expense-files/{fileId}")
    @Operation(summary = "Remove an expense document")
    public BatchMoneyDto deleteExpenseFile(@PathVariable long fileId) {
        return costing.deleteExpenseFile(fileId);
    }

    @GetMapping("/nbu-rate")
    @Operation(summary = "The official NBU rate for a date (a hint; the admin may type his own)")
    public RateDto nbuRate(@RequestParam String currency, @RequestParam(required = false) LocalDate date) {
        return costing.nbuRate(currency, date);
    }

    // ----- product, opening cost, reconcile

    @GetMapping("/products/{productId}")
    @Operation(summary = "Product lots (FIFO), the cost that sells next and the margin at the current price")
    public ProductCostDto product(@PathVariable String productId) {
        return costing.product(productId);
    }

    @GetMapping("/opening")
    @Operation(summary = "Old stock without a known cost («Начальная себестоимость»)")
    public List<OpeningRowDto> opening() {
        return costing.opening();
    }

    @PutMapping("/opening")
    @Operation(summary = "Type the cost of the old stock of one product (variant); null clears it")
    public List<OpeningRowDto> setOpening(@RequestBody OpeningRequest req) {
        return costing.setOpening(req);
    }

    @PostMapping("/reconcile")
    @Operation(summary = "«Выровнять»: lots match the stock of every product again")
    public ReconcileDto reconcile() {
        return costing.reconcile();
    }
}
