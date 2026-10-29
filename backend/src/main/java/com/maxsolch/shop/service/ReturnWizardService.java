package com.maxsolch.shop.service;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.OrderAdjustmentDtos;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Return wizard (V68): the goods and the manual refunds are saved first; a refund through
 * monobank is requested after the plan is checked (it is an outside call) and booked when the bank
 * confirms — so it is never counted twice.
 *
 * <p>Not {@code @Transactional}: the money moves through the bank between two separate
 * transactions of {@link OrderAdjustmentService}, and the audit entries are written on their own.
 * Only one wizard per order runs at a time on this instance ({@link #inFlight}); a second submit is
 * refused rather than queued. The lock is in memory, so it does not cover a second backend instance.
 */
@Service
public class ReturnWizardService {

    private final AdminOrderQueries queries;
    private final OrderService orderService;
    private final OrderAdjustmentService adjustments;
    private final OnlinePaymentService payments;
    private final AdminAuditService audit;

    /** Orders whose return wizard is running right now (one backend instance): no double submit. */
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();

    public ReturnWizardService(AdminOrderQueries queries, OrderService orderService,
                               OrderAdjustmentService adjustments, OnlinePaymentService payments,
                               AdminAuditService audit) {
        this.queries = queries;
        this.orderService = orderService;
        this.adjustments = adjustments;
        this.payments = payments;
        this.audit = audit;
    }

    /** Runs the wizard for order {@code id}; returns the order as it is after the return. */
    public Order register(String id, OrderAdjustmentDtos.ReturnWizardRequest req) {
        Order order = queries.load(id);
        List<OrderAdjustmentService.WizardLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new OrderAdjustmentService.WizardLine(l.itemId(), l.quantity(), parseOutcome(l.outcome())))
                        .toList();
        List<OrderAdjustmentService.ManualRefund> refunds = req.refunds() == null ? List.of()
                : req.refunds().stream()
                        .filter(r -> r.amountMinor() != 0)
                        .map(r -> new OrderAdjustmentService.ManualRefund(
                                MoneyLedger.parseChannel(r.channel()), r.amountMinor(), r.note()))
                        .toList();
        long mono = req.monoRefundMinor() == null ? 0 : req.monoRefundMinor();
        OrderAdjustmentService.ReturnPlan plan = new OrderAdjustmentService.ReturnPlan(lines, refunds,
                req.retainMinor() == null ? 0 : req.retainMinor(), mono, req.note(),
                req.notifyCustomer() == null || req.notifyCustomer());
        String key = UuidUtil.toString(order.getId());
        if (!inFlight.add(key)) {
            throw new BadRequestException("возврат по этому заказу уже оформляется — дождитесь окончания");
        }
        try {
            // Check first, then the bank, then the books: a refused plan sends no money, and a refund
            // monobank refuses leaves nothing half-saved to be entered twice on a retry.
            adjustments.checkReturnPlan(order.getId(), plan);
            if (mono > 0) {
                String monoInvoice = payments.refundableInvoice(order.getId(), mono);
                try {
                    payments.refund(order.getId(), monoInvoice, mono);
                } catch (BadRequestException e) {
                    throw new BadRequestException("monobank не принял возврат денег: " + e.getMessage()
                            + ". Ничего не сохранено — исправьте и повторите.", "MONO_REFUND_FAILED");
                }
                audit.record("ORDER_REFUND_ONLINE", "ORDER", id,
                        "возврат на карту через monobank " + MoneyFormat.uah(mono) + " (мастер возврата)");
            }
            OrderAdjustmentService.Result r = adjustments.registerReturnPlan(order.getId(), plan,
                    audit.currentAdminName(), mono > 0);
            audit.record("ORDER_RETURN", "ORDER", id, r.auditDetails());
        } finally {
            inFlight.remove(key);
        }
        return orderService.get(order.getId());
    }

    /** The state of a returned line from the request; empty means «на склад». */
    public static OrderAdjustmentService.LineOutcome parseOutcome(String s) {
        if (s == null || s.isBlank()) {
            return OrderAdjustmentService.LineOutcome.RESTOCK;
        }
        try {
            return OrderAdjustmentService.LineOutcome.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неизвестное состояние товара: " + s);
        }
    }
}
