package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.MoneyFormat;
import org.springframework.stereotype.Service;

/**
 * What the admin does with a customer's cancellation request of a paid order: loads the order of the URL, runs
 * {@link CancelRequestService} and writes the audit entry after it has committed (not {@code @Transactional}: the
 * refund goes to the bank in between).
 */
@Service
public class AdminCancelRequests {

    private final AdminOrderQueries queries;
    private final CancelRequestService cancelRequests;
    private final AdminAuditService audit;

    public AdminCancelRequests(AdminOrderQueries queries, CancelRequestService cancelRequests,
                               AdminAuditService audit) {
        this.queries = queries;
        this.cancelRequests = cancelRequests;
        this.audit = audit;
    }

    public CancelRequestService.ApproveResult approve(String id, String comment) {
        Order order = queries.load(id);
        CancelRequestService.ApproveResult r = cancelRequests.approve(order.getId(), comment);
        audit.record("ORDER_CANCEL_REQUEST_APPROVE", "ORDER", id,
                "запрос отмены одобрен: заказ отменён, сток возвращён, на возврат "
                        + MoneyFormat.uah(r.refundRequestedMinor()) + " (" + r.refundedInvoices() + " счёт.)"
                        + (r.refundErrors().isEmpty() ? "" : ", ошибки возврата: " + String.join("; ", r.refundErrors()))
                        + (r.manualRefundMinor() > 0 ? ", вернуть вручную: " + MoneyFormat.uah(r.manualRefundMinor()) : ""));
        return r;
    }

    public Order decline(String id, String comment) {
        Order order = queries.load(id);
        Order updated = cancelRequests.decline(order.getId(), comment);
        audit.record("ORDER_CANCEL_REQUEST_DECLINE", "ORDER", id, "запрос отмены отклонён: " + comment);
        return updated;
    }
}
