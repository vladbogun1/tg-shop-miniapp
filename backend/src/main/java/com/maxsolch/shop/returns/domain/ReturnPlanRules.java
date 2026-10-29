package com.maxsolch.shop.returns.domain;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.platform.util.MoneyFormat;

import java.util.List;
import java.util.function.LongSupplier;

/** Status, amounts and channels a return-wizard plan must satisfy; nothing is changed. */
public final class ReturnPlanRules {

    private ReturnPlanRules() {
    }

    /**
     * @param retainedBefore money the shop already kept on purpose (read from the journal only when needed)
     * @param monoSent       the monobank part was already accepted by the bank: it may already be booked as
     *                       refunded, so it is left out of the limit here
     */
    public static void validate(Order order, ReturnPlan plan, LongSupplier retainedBefore, boolean monoSent) {
        OrderStatus s = order.getStatus();
        boolean overpaidInWork = OrderTransitions.isOpen(s) && OrderMoney.overpaidMinor(order) > 0;
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED && !overpaidInWork) {
            throw OrderErrors.badRequest("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<WizardLine> lines = plan.activeLines();
        if (s == OrderStatus.SHIPPED && !lines.isEmpty() && PartialPickup.nothingPickedUp(order, lines)) {
            throw OrderErrors.badRequest("покупатель не забрал ничего — отклоните заказ с «Посылка едет назад»");
        }
        long pickupValue = s == OrderStatus.SHIPPED ? PartialPickup.refusedValueMinor(order, lines, false) : 0;
        if ((s == OrderStatus.REJECTED || overpaidInWork) && !lines.isEmpty()) {
            throw OrderErrors.badRequest(s == OrderStatus.REJECTED
                    ? "по отклонённому заказу товар принимается кнопкой «Посылка вернулась», здесь — только деньги"
                    : "заказ ещё не отправлен — можно вернуть только переплату");
        }
        long manual = manualTotal(plan.activeRefunds());
        if (plan.retainMinor() < 0 || plan.monoRefundMinor() < 0) {
            throw OrderErrors.badRequest("сумма не может быть отрицательной");
        }
        long retained = retainedBefore.getAsLong();
        long refundable = Math.max(0, OrderMoney.refundableMinor(order) - retained);
        long mono = monoSent ? 0 : plan.monoRefundMinor();
        if (manual + mono + plan.retainMinor() > refundable) {
            throw OrderErrors.badRequest("вернуть и удержать вместе можно не больше, чем получено и ещё не возвращено"
                    + (retained > 0 ? " (без уже удержанных " + MoneyFormat.uah(retained) + ")" : "")
                    + ": " + MoneyFormat.uah(refundable));
        }
        if (overpaidInWork) {
            long over = OrderMoney.overpaidMinor(order);
            if (manual + mono > over) {
                throw OrderErrors.badRequest("до отправки можно вернуть только переплату: " + MoneyFormat.uah(over));
            }
        }
        if (s == OrderStatus.SHIPPED && manual + mono > 0) {
            // Partial pickup: the refused units come off наложка; only money paid above what the
            // customer owes for the rest goes back.
            long over = Math.max(0, OrderMoney.netReceivedMinor(order)
                    - (OrderMoney.collectableMinor(order) - pickupValue));
            if (manual + mono > over) {
                throw OrderErrors.badRequest(over == 0
                        ? "посылка ещё на почте — за невыкупленное покупатель просто не платит наложку, вернуть нечего"
                        : "посылка ещё на почте — вернуть можно только переплату: " + MoneyFormat.uah(over));
            }
        }
        if (lines.isEmpty() && manual == 0 && plan.monoRefundMinor() == 0 && plan.retainMinor() == 0) {
            throw OrderErrors.badRequest("укажите, что вернули, или сумму возврата");
        }
    }

    private static long manualTotal(List<ManualRefund> refunds) {
        long manual = 0;
        for (ManualRefund r : refunds) {
            if (r.amountMinor() < 0) {
                throw OrderErrors.badRequest("сумма возврата не может быть отрицательной");
            }
            if (r.channel() == null) {
                throw OrderErrors.badRequest("укажите, как вернули деньги");
            }
            if (r.channel() == OrderMoneyMovement.Channel.MONO) {
                throw OrderErrors.badRequest("возврат на карту через monobank — отдельной строкой «через monobank»");
            }
            manual += r.amountMinor();
        }
        return manual;
    }
}
