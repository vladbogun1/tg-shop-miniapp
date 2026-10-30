package com.maxsolch.shop.returns.domain;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.Order;
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
            throw new DomainException.BadRequest(ReturnsError.RETURN_STATUS_NOT_ALLOWED);
        }
        List<WizardLine> lines = plan.activeLines();
        if (s == OrderStatus.SHIPPED && !lines.isEmpty() && PartialPickup.nothingPickedUp(order, lines)) {
            throw new DomainException.BadRequest(ReturnsError.NOTHING_PICKED_UP);
        }
        long pickupValue = s == OrderStatus.SHIPPED ? PartialPickup.refusedValueMinor(order, lines, false) : 0;
        if ((s == OrderStatus.REJECTED || overpaidInWork) && !lines.isEmpty()) {
            throw (s == OrderStatus.REJECTED
                    ? new DomainException.BadRequest(ReturnsError.REJECTED_MONEY_ONLY_PARCEL)
                    : new DomainException.BadRequest(ReturnsError.NOT_SHIPPED_OVERPAYMENT_ONLY));
        }
        long manual = manualTotal(plan.activeRefunds());
        if (plan.retainMinor() < 0 || plan.monoRefundMinor() < 0) {
            throw new DomainException.BadRequest(ReturnsError.AMOUNT_NEGATIVE);
        }
        long retained = retainedBefore.getAsLong();
        long refundable = Math.max(0, OrderMoney.refundableMinor(order) - retained);
        long mono = monoSent ? 0 : plan.monoRefundMinor();
        if (manual + mono + plan.retainMinor() > refundable) {
            throw (retained > 0
                    ? new DomainException.BadRequest(ReturnsError.REFUND_RETAIN_EXCEEDS_NET, MoneyFormat.uah(retained), MoneyFormat.uah(refundable))
                    : new DomainException.BadRequest(ReturnsError.REFUND_RETAIN_EXCEEDS, MoneyFormat.uah(refundable)));
        }
        if (overpaidInWork) {
            long over = OrderMoney.overpaidMinor(order);
            if (manual + mono > over) {
                throw new DomainException.BadRequest(ReturnsError.PRE_SHIPMENT_OVERPAYMENT_LIMIT, MoneyFormat.uah(over));
            }
        }
        if (s == OrderStatus.SHIPPED && manual + mono > 0) {
            // Partial pickup: the refused units come off наложка; only money paid above what the
            // customer owes for the rest goes back.
            long over = Math.max(0, OrderMoney.netReceivedMinor(order)
                    - (OrderMoney.collectableMinor(order) - pickupValue));
            if (manual + mono > over) {
                throw (over == 0
                        ? new DomainException.BadRequest(ReturnsError.PARCEL_AT_POST_NOTHING_TO_RETURN)
                        : new DomainException.BadRequest(ReturnsError.PARCEL_AT_POST_OVERPAYMENT_ONLY, MoneyFormat.uah(over)));
            }
        }
        if (lines.isEmpty() && manual == 0 && plan.monoRefundMinor() == 0 && plan.retainMinor() == 0) {
            throw new DomainException.BadRequest(ReturnsError.RETURN_OR_AMOUNT_REQUIRED);
        }
    }

    private static long manualTotal(List<ManualRefund> refunds) {
        long manual = 0;
        for (ManualRefund r : refunds) {
            if (r.amountMinor() < 0) {
                throw new DomainException.BadRequest(ReturnsError.REFUND_NEGATIVE);
            }
            if (r.channel() == null) {
                throw new DomainException.BadRequest(ReturnsError.REFUND_METHOD_REQUIRED);
            }
            if (r.channel() == OrderMoneyMovement.Channel.MONO) {
                throw new DomainException.BadRequest(ReturnsError.MONO_SEPARATE_LINE);
            }
            manual += r.amountMinor();
        }
        return manual;
    }
}
