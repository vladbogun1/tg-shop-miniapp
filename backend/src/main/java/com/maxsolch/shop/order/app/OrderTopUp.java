package com.maxsolch.shop.order.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.order.domain.Order;
import org.springframework.stereotype.Service;

/**
 * How the shop takes the top-up of a paid online order that got more expensive after the payment (the admin
 * added an item, pressed «+» at a quantity): online before shipping (the default — the customer gets
 * «Доплатити»), наложкой on delivery, or not at all (a discount for the difference). The customer is told by
 * {@link TopUpNoticeJobs} once the order stops changing, so a series of «+» gives one message. The audit entry is
 * written after the change has committed.
 */
@Service
public class OrderTopUp {

    /** What the admin chose for the rest of the order. */
    public enum Mode {
        /** The customer pays online in the order («Доплатити»); shipping waits for it. */
        ONLINE,
        /** Наложкой at the Nova Poshta branch; the customer may still pay online. */
        ON_DELIVERY,
        /** The shop does not take it: the difference comes off as a discount. */
        WAIVE
    }

    private final AdminOrderQueries queries;
    private final OrderTopUpChange change;
    private final AdminAuditService audit;

    OrderTopUp(AdminOrderQueries queries, OrderTopUpChange change, AdminAuditService audit) {
        this.queries = queries;
        this.change = change;
        this.audit = audit;
    }

    public Order choose(String id, Mode mode) {
        OrderTopUpChange.Applied applied = change.apply(queries.load(id).getId(), mode);
        audit.record("ORDER_TOPUP", "ORDER", id, applied.audit());
        return applied.order();
    }
}
