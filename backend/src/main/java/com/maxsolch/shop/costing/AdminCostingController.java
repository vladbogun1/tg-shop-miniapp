package com.maxsolch.shop.costing;

import com.maxsolch.shop.analytics.metrics.AdminMetricsService;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.costing.CostingDtos.BatchMoneyDto;
import com.maxsolch.shop.costing.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.costing.CostingDtos.ExpenseRequest;
import com.maxsolch.shop.costing.CostingDtos.MarginReportDto;
import com.maxsolch.shop.costing.CostingDtos.MoneyRequest;
import com.maxsolch.shop.costing.CostingDtos.OpeningRequest;
import com.maxsolch.shop.costing.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.costing.CostingDtos.OrderProfitDto;
import com.maxsolch.shop.costing.CostingDtos.ProductCostDto;
import com.maxsolch.shop.costing.CostingDtos.RateDto;
import com.maxsolch.shop.costing.CostingDtos.ReconcileDto;
import com.maxsolch.shop.security.AdminAccess;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Purchase prices, batch expenses, cost of goods and margin (docs/PREORDERS-PLAN.md §5А). Every endpoint is
 * for the main admin and admins with «Финансы»; changes go to the admin journal.
 */
@RestController
@RequestMapping("/api/admin/costing")
@RequiredAdmin
@Tag(name = "Admin Costing", description = "Batch money, FIFO cost of goods, margin")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCostingController {

    private final CostingService costing;
    private final MarginService margin;
    private final NbuRateClient nbu;
    private final AdminAccess access;
    private final AdminAuditService audit;
    private final AdminMetricsService metrics;

    public AdminCostingController(CostingService costing, MarginService margin, NbuRateClient nbu,
                                  AdminAccess access, AdminAuditService audit, AdminMetricsService metrics) {
        this.costing = costing;
        this.margin = margin;
        this.nbu = nbu;
        this.access = access;
        this.audit = audit;
        this.metrics = metrics;
    }

    @GetMapping("/access")
    @Operation(summary = "May the caller see money (the main admin or «Финансы»)")
    public Map<String, Boolean> canSee() {
        return Map.of("finance", access.canSeeFinance(SecurityContextHolder.getContext().getAuthentication()));
    }

    // ----- batch money

    @GetMapping("/batches/{id}")
    @Operation(summary = "Batch money: purchase, rate, expenses, cost per unit and margin")
    public BatchMoneyDto money(@PathVariable long id) {
        finance();
        return costing.money(id);
    }

    @PutMapping("/batches/{id}")
    @Operation(summary = "Save currency, rate, allocation, «Все расходы внесены» and line prices / weights")
    public BatchMoneyDto saveMoney(@PathVariable long id, @RequestBody MoneyRequest req) {
        finance();
        BatchMoneyDto dto = costing.saveMoney(id, req);
        audit.record("COSTING_BATCH_MONEY", "PREORDER_BATCH", String.valueOf(id),
                dto.currency() + " · курс " + dto.fxRate() + " · " + dto.allocation()
                        + (dto.costsFinal() ? " · расходы внесены" : ""));
        return dto;
    }

    @PostMapping("/batches/{id}/expenses")
    @Operation(summary = "Add an expense to the batch (or to one line)")
    public BatchMoneyDto addExpense(@PathVariable long id, @RequestBody ExpenseRequest req) {
        finance();
        BatchMoneyDto dto = costing.addExpense(id, req, audit.currentAdminName());
        audit.record("COSTING_EXPENSE_ADD", "PREORDER_BATCH", String.valueOf(id), describe(req));
        return dto;
    }

    @PutMapping("/expenses/{expenseId}")
    @Operation(summary = "Edit an expense")
    public BatchMoneyDto updateExpense(@PathVariable long expenseId, @RequestBody ExpenseRequest req) {
        finance();
        BatchMoneyDto dto = costing.updateExpense(expenseId, req);
        audit.record("COSTING_EXPENSE_EDIT", "BATCH_EXPENSE", String.valueOf(expenseId), describe(req));
        return dto;
    }

    @DeleteMapping("/expenses/{expenseId}")
    @Operation(summary = "Delete an expense")
    public BatchMoneyDto deleteExpense(@PathVariable long expenseId) {
        finance();
        BatchMoneyDto dto = costing.deleteExpense(expenseId);
        audit.record("COSTING_EXPENSE_DELETE", "BATCH_EXPENSE", String.valueOf(expenseId), "удалён");
        return dto;
    }

    @GetMapping("/batches/{id}/sales")
    @Operation(summary = "P&L of the batch: spent, sold, profit, left on the shelf, days to sell out")
    public BatchSalesDto sales(@PathVariable long id) {
        finance();
        return margin.batch(id);
    }

    @GetMapping("/nbu-rate")
    @Operation(summary = "The official NBU rate for a date (a hint; the admin may type his own)")
    public RateDto nbuRate(@RequestParam String currency, @RequestParam(required = false) LocalDate date) {
        finance();
        LocalDate d = date != null ? date : LocalDate.now(ZoneId.of("Europe/Kyiv"));
        String c = currency.trim().toUpperCase(Locale.ROOT);
        return new RateDto(c, d, nbu.rate(c, d));
    }

    // ----- product, opening cost, reconcile

    @GetMapping("/products/{productId}")
    @Operation(summary = "Product lots (FIFO), the cost that sells next and the margin at the current price")
    public ProductCostDto product(@PathVariable String productId) {
        finance();
        return costing.product(productId);
    }

    @GetMapping("/opening")
    @Operation(summary = "Old stock without a known cost («Начальная себестоимость»)")
    public List<OpeningRowDto> opening() {
        finance();
        return costing.opening();
    }

    @PutMapping("/opening")
    @Operation(summary = "Type the cost of the old stock of one product (variant); null clears it")
    public List<OpeningRowDto> setOpening(@RequestBody OpeningRequest req) {
        finance();
        costing.setOpening(req);
        audit.record("COSTING_OPENING", "PRODUCT", req.productId(),
                (req.variantId() == null ? "" : "вариант " + req.variantId() + ": ")
                        + (req.unitCostMinor() == null ? "очищено" : req.unitCostMinor() / 100.0 + " ₴"));
        return costing.opening();
    }

    @PostMapping("/reconcile")
    @Operation(summary = "«Выровнять»: lots match the stock of every product again")
    public ReconcileDto reconcile() {
        finance();
        ReconcileDto r = costing.reconcile();
        audit.record("COSTING_RECONCILE", "STOCK", "all", "выровнено ключей: " + r.fixed());
        return r;
    }

    // ----- order and report

    @GetMapping("/orders/{orderId}")
    @Operation(summary = "Profit of an order: revenue − cost of goods − acquiring fee")
    public OrderProfitDto order(@PathVariable String orderId) {
        finance();
        return margin.order(orderId);
    }

    @GetMapping("/report")
    @Operation(summary = "«Метрики → Маржа»: revenue, cost, profit, by product / brand / category / batch")
    public MarginReportDto report(@RequestParam(defaultValue = "month") String period,
                                  @RequestParam(required = false) String from,
                                  @RequestParam(required = false) String to) {
        finance();
        return margin.report(metrics.period(period, from, to));
    }

    private void finance() {
        access.requireFinance(SecurityContextHolder.getContext().getAuthentication());
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
