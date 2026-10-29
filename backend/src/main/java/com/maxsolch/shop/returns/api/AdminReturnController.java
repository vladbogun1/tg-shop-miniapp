package com.maxsolch.shop.returns.api;

import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.returns.app.AdminReturns;
import com.maxsolch.shop.returns.app.Exchanges;
import com.maxsolch.shop.returns.app.Returns;
import com.maxsolch.shop.returns.app.ReturnCancellation;
import com.maxsolch.shop.returns.app.ReturnReceiving;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Returns and exchanges of an order. Thin: request → arguments, {@link AdminReturns} does the work, the page is the order detail. */
@RestController
@RequestMapping("/api/admin/orders")
@RequiredAdmin
@Tag(name = "Admin Orders", description = "Returns and exchanges of an order")
@SecurityRequirement(name = "bearer-jwt")
public class AdminReturnController {

    private final AdminReturns adminReturns;
    private final OrderQueryService orderQueryService;

    public AdminReturnController(AdminReturns adminReturns, OrderQueryService orderQueryService) {
        this.adminReturns = adminReturns;
        this.orderQueryService = orderQueryService;
    }

    @PostMapping("/{id}/return")
    @Operation(summary = "Register a (partial) return: returned units per line, restock per line, refunded amount")
    public OrderDetailDto registerReturn(@PathVariable String id,
                                         @Valid @RequestBody ReturnDtos.RegisterReturnRequest req) {
        List<Returns.ReturnLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new Returns.ReturnLine(l.itemId(), l.quantity(), l.restock() == null || l.restock()))
                        .toList();
        return orderQueryService.toDetail(adminReturns.registerReturn(id, lines,
                req.refundMinor() == null ? 0 : req.refundMinor(), req.note()));
    }

    /** Return wizard (V68): the whole flow, incl. the monobank refund and the one-at-a-time lock, is in {@link AdminReturns}. */
    @PostMapping("/{id}/returns")
    @Operation(summary = "Return wizard: lines (RESTOCK/DEFECT/KEPT), manual refunds by channel, "
            + "optional monobank refund, retained amount")
    public OrderDetailDto returnWizard(@PathVariable String id,
                                       @Valid @RequestBody ReturnDtos.ReturnWizardRequest req) {
        List<WizardLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new WizardLine(l.itemId(), l.quantity(), parseOutcome(l.outcome())))
                        .toList();
        List<ManualRefund> refunds = req.refunds() == null ? List.of()
                : req.refunds().stream()
                        .filter(r -> r.amountMinor() != 0)
                        .map(r -> new ManualRefund(MoneyLedger.parseChannel(r.channel()), r.amountMinor(), r.note()))
                        .toList();
        ReturnPlan plan = new ReturnPlan(lines, refunds,
                req.retainMinor() == null ? 0 : req.retainMinor(),
                req.monoRefundMinor() == null ? 0 : req.monoRefundMinor(), req.note(),
                req.notifyCustomer() == null || req.notifyCustomer());
        return orderQueryService.toDetail(adminReturns.registerPlan(id, plan));
    }

    @PostMapping("/{id}/exchange")
    @Operation(summary = "Exchange on a delivered order: the returned units come back like a return (on their way "
            + "or already in stock / written off), the replacement goes out as a NEW linked order with its own ТТН; "
            + "returns the new order")
    public OrderDetailDto exchange(@PathVariable String id, @Valid @RequestBody ReturnDtos.ExchangeRequest req) {
        List<WizardLine> returned = req.returned() == null ? List.of()
                : req.returned().stream()
                        .map(l -> new WizardLine(l.itemId(), l.quantity(),
                                l.outcome() == null || l.outcome().isBlank() ? null : parseOutcome(l.outcome())))
                        .toList();
        List<Exchanges.NewLine> items = req.items() == null ? List.of()
                : req.items().stream()
                        .map(l -> new Exchanges.NewLine(l.productId(), l.variantId(), l.quantity()))
                        .toList();
        OrderStatus target = OrderStatus.NEW;
        if (req.targetStatus() != null && !req.targetStatus().isBlank()) {
            try {
                target = OrderStatus.valueOf(req.targetStatus().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw OrderErrors.badRequest("неизвестный статус: " + req.targetStatus());
            }
        }
        return orderQueryService.toDetail(adminReturns.exchange(id, returned, items, target,
                req.notifyCustomer() == null || req.notifyCustomer(), req.note()));
    }

    @PostMapping("/{id}/return-received")
    @Operation(summary = "The refused parcel is back at the shop: sellable units restocked, DEFECT lines written off")
    public OrderDetailDto returnReceived(@PathVariable String id,
                                         @Valid @RequestBody ReturnDtos.ReceiveReturnRequest req) {
        List<ReturnReceiving.ReceivedLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new ReturnReceiving.ReceivedLine(l.itemId(), l.quantity(), parseOutcome(l.outcome())))
                        .toList();
        return orderQueryService.toDetail(adminReturns.receive(id, lines, req.note()));
    }

    @PostMapping("/{id}/returns/{returnId}/cancel")
    @Operation(summary = "Cancel the newest return / exchange: units back into the order, money back or as a debt")
    public OrderDetailDto cancelReturn(@PathVariable String id, @PathVariable long returnId,
                                       @Valid @RequestBody ReturnDtos.CancelReturnRequest req) {
        ReturnCancellation.CancelMoney money = null;
        if (req.money() != null && !req.money().isBlank()) {
            try {
                money = ReturnCancellation.CancelMoney.valueOf(req.money().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw OrderErrors.badRequest("неизвестный вариант денег: " + req.money());
            }
        }
        return orderQueryService.toDetail(adminReturns.cancel(id, returnId, money, req.note()));
    }

    @PostMapping("/{id}/returns/{returnId}/debt-paid")
    @Operation(summary = "The customer sent back the money of a cancelled return")
    public OrderDetailDto returnDebtPaid(@PathVariable String id, @PathVariable long returnId) {
        return orderQueryService.toDetail(adminReturns.debtPaid(id, returnId));
    }

    /** The state of a returned line from the request; empty means «на склад». */
    static LineOutcome parseOutcome(String s) {
        if (s == null || s.isBlank()) {
            return LineOutcome.RESTOCK;
        }
        try {
            return LineOutcome.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw OrderErrors.badRequest("неизвестное состояние товара: " + s);
        }
    }
}
