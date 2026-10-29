package com.maxsolch.shop.service;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderMoney;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.RejectReasonCode;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.web.dto.UpdateOrderStatusRequest;
import org.springframework.stereotype.Service;

/**
 * The admin's «change status» action: checks the request, moves the order, closes the monobank
 * pages of a rejected one and writes the admin journal.
 *
 * <p><b>Deliberately not {@code @Transactional}.</b> The status change itself is one transaction
 * inside {@link OrderService}; closing the invoices and the audit entries come after it has
 * committed, each in its own transaction ({@link AdminAuditService#record} is
 * {@code REQUIRES_NEW} and never throws). Wrapping this in a transaction would write the journal
 * before the commit, so a failed commit would leave an entry for a change that never happened.
 * The same goes for the order of the steps: if closing the invoices fails, the status is already
 * saved and no «ORDER_STATUS» entry is written — the exception goes to the caller as before.
 */
@Service
public class AdminOrderStatusService {

    private final AdminOrderQueries queries;
    private final OrderService orderService;
    private final OnlinePaymentService payments;
    private final AdminAuditService audit;

    public AdminOrderStatusService(AdminOrderQueries queries, OrderService orderService,
                                   OnlinePaymentService payments, AdminAuditService audit) {
        this.queries = queries;
        this.orderService = orderService;
        this.payments = payments;
        this.audit = audit;
    }

    /** Applies the request to order {@code id} and returns the order as it is after the change. */
    public Order change(String id, UpdateOrderStatusRequest req) {
        OrderStatus target = parseStatus(req.status());
        boolean restock = req.restock() == null || req.restock();
        RejectReasonCode reasonCode = parseReasonCode(req.rejectReasonCode());
        if (target == OrderStatus.SHIPPED && (req.trackingNumber() == null || req.trackingNumber().isBlank())) {
            throw new BadRequestException("укажите номер ТТН");
        }
        if (target == OrderStatus.REJECTED && reasonCode == null
                && (req.rejectReason() == null || req.rejectReason().isBlank())) {
            throw new BadRequestException("укажите причину отклонения");
        }
        if (reasonCode == RejectReasonCode.OTHER && (req.rejectReason() == null || req.rejectReason().isBlank())) {
            throw new BadRequestException("для причины «Другое» напишите пояснение");
        }
        Order before = queries.load(id);
        // Read before the change: shipping does not move the money, but the check belongs to the order as it was.
        boolean unpaidShip = target == OrderStatus.SHIPPED && OrderMoney.onlinePaymentMissing(before);
        long missingMinor = unpaidShip ? OrderMoney.amountDueMinor(before) : 0;
        boolean inTransit = target == OrderStatus.REJECTED && Boolean.TRUE.equals(req.returnInTransit());
        Order updated = inTransit
                ? orderService.reject(before.getId(), req.rejectReason(), reasonCode, restock, true)
                : orderService.changeStatus(before.getId(), target,
                        req.trackingNumber(), req.rejectReason(), reasonCode, restock, Boolean.TRUE.equals(req.shipUnpaid()));
        if (target == OrderStatus.REJECTED) {
            // An approved order stays payable past its deadline — close the open monobank pages, so
            // nobody pays for an order we have just cancelled.
            payments.closeOpenInvoices(updated.getId());
        }
        if (unpaidShip) {
            // Shown in the order's «История»: who decided to send it without the money.
            String who = audit.currentAdminName();
            audit.record("ORDER_SHIP_UNPAID", "ORDER", id, "отправлен без онлайн-оплаты (не пришло "
                    + MoneyFormat.uah(missingMinor) + ") по решению админа" + (who == null || who.isBlank() ? "" : " " + who));
        }
        audit.record("ORDER_STATUS", "ORDER", id,
                "статус → " + target.name()
                        + (req.trackingNumber() == null ? "" : ", ТТН " + req.trackingNumber())
                        + (reasonCode == null ? "" : ", код причины " + reasonCode.name())
                        + (req.rejectReason() == null || req.rejectReason().isBlank() ? "" : ", причина: " + req.rejectReason())
                        + (target == OrderStatus.REJECTED
                                ? (OrderService.RETURN_IN_TRANSIT.equals(updated.getReturnStatus())
                                        ? ", посылка едет назад (сток — по приходу)"
                                        : restock ? ", сток возвращён" : ", БЕЗ возврата стока")
                                : ""));
        return updated;
    }

    /** An order status from the request, 400 with the admin-facing text for an unknown one. */
    public static OrderStatus parseStatus(String s) {
        try {
            return OrderStatus.valueOf(s.trim().toUpperCase());
        } catch (Exception e) {
            throw new BadRequestException("неизвестный статус: " + s);
        }
    }

    private static RejectReasonCode parseReasonCode(String s) {
        try {
            return RejectReasonCode.parseOrNull(s);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неизвестная причина отказа: " + s);
        }
    }
}
