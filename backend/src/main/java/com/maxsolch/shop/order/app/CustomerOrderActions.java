package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.journal.app.ActivityLog;
import org.springframework.stereotype.Service;

/** What the customer does with their own order (write in the chat, cancel, ask to cancel); the journal notes it. */
@Service
public class CustomerOrderActions {

    private final MessageService messageService;
    private final CancelRequestService cancelRequests;
    private final ActivityLog activity;

    public CustomerOrderActions(MessageService messageService, CancelRequestService cancelRequests,
                                ActivityLog activity) {
        this.messageService = messageService;
        this.cancelRequests = cancelRequests;
        this.activity = activity;
    }

    public MessageDto sendMessage(Order order, String rawId, SendMessageRequest req) {
        MessageDto sent = messageService.postCustomerMessage(order.getId(), order.getUserId(), order.getCustomerName(), req);
        // The text itself stays in the chat — the journal only notes that the customer wrote.
        activity.record(activity.fromRequest("CHAT_MESSAGE").order(order.getId())
                .text("Покупатель написал в чат заказа #" + rawId.substring(0, Math.min(8, rawId.length())))
                .detail("kind", req == null ? null : req.type()));
        return sent;
    }

    /** Refreshes the payment state first; 400 PAYMENT_IN_PROGRESS while the bank is charging, 400 PAID_NEEDS_REQUEST once paid. */
    public Order cancelUnpaid(Order order, String reason) {
        Order cancelled;
        try {
            cancelled = cancelRequests.cancelUnpaid(order.getId(), reason);
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("ORDER_CANCEL_FAILED").order(order.getId())
                    .text("Отмена заказа не прошла: " + e.getMessage()).rejected(e));
            throw e;
        }
        activity.record(activity.fromRequest("ORDER_CANCELLED").order(order.getId())
                .text("Покупатель отменил неоплаченный заказ" + reasonSuffix(reason)));
        return cancelled;
    }

    public Order requestCancel(Order order, String reason) {
        Order updated;
        try {
            updated = cancelRequests.request(order.getId(), reason);
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("CANCEL_REQUEST_FAILED").order(order.getId())
                    .text("Заявка на отмену не принята: " + e.getMessage()).rejected(e));
            throw e;
        }
        activity.record(activity.fromRequest("CANCEL_REQUESTED").order(order.getId())
                .text("Заявка на отмену оплаченного заказа" + reasonSuffix(reason)));
        return updated;
    }

    private static String reasonSuffix(String reason) {
        String r = reason == null ? "" : reason.trim();
        return r.isEmpty() ? "" : ": " + (r.length() > 200 ? r.substring(0, 199) + "…" : r);
    }
}
