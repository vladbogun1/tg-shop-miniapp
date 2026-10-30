package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.journal.app.ActivityLog;
import org.springframework.stereotype.Service;

/** The customer opens the payment page of their order; a failure to open it is noted in the journal. */
@Service
public class CustomerPaymentStart {

    private final OnlinePaymentService onlinePayments;
    private final ActivityLog activity;

    public CustomerPaymentStart(OnlinePaymentService onlinePayments, ActivityLog activity) {
        this.onlinePayments = onlinePayments;
        this.activity = activity;
    }

    public OnlinePaymentService.StartedPayment start(Order order, OnlinePaymentService.ReturnTo returnTo, String lang,
                                                     boolean embedded) {
        try {
            return onlinePayments.start(order.getId(), returnTo, lang, embedded);
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("PAYMENT_START_FAILED").order(order.getId())
                    .text("Не удалось открыть оплату: " + e.getMessage())
                    .detail("returnTo", returnTo).rejected(e));
            throw e;
        }
    }
}
