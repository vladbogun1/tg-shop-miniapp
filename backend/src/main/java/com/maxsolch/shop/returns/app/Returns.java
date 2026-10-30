package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.OrderTransitions;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.returns.domain.PartialPickup;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.ReturnPlanRules;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.order.app.OrderStock;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/**
 * Registering a return: the simple one (units and one refund) and the wizard (V68) with lines in four states,
 * manual refunds by channel, a monobank part and money the shop keeps. The status is not touched — a fully
 * refused parcel is still an «Отклонить» with reason REFUSED_AT_POST; this is for what happens around and after
 * that. Every amount lands in the money journal, defects in «Списания», and each wizard run leaves a return record
 * so it can be cancelled ({@link ReturnCancellation}).
 */
@Service
public class Returns {

    private final OrderLookup orders;
    private final OrderStock stock;
    private final MoneyLedger moneyLedger;
    private final DefectWriteoffs defects;
    private final OrderReturnRepository returnRecords;
    private final OrderReturnLineRepository returnLines;
    private final DomainEvents events;
    private final Clock clock;

    public Returns(OrderLookup orders, OrderStock stock, MoneyLedger moneyLedger, DefectWriteoffs defects,
                   OrderReturnRepository returnRecords, OrderReturnLineRepository returnLines,
                   DomainEvents events, Clock clock) {
        this.orders = orders;
        this.stock = stock;
        this.moneyLedger = moneyLedger;
        this.defects = defects;
        this.returnRecords = returnRecords;
        this.returnLines = returnLines;
        this.events = events;
        this.clock = clock;
    }

    /**
     * One returned line.
     *
     * @param itemId   order item id
     * @param quantity units the customer sent back now
     * @param restock  put those units back on the shelf (false when not sellable)
     */
    public record ReturnLine(long itemId, int quantity, boolean restock) {
    }

    /**
     * Registers a (partial) return: which units came back, which of them go back to stock, and how
     * much money is refunded.
     *
     * <p>Allowed for SHIPPED / DELIVERED (goods came back) and for REJECTED, where only a refund
     * can be recorded: a rejected order's stock was settled at rejection time. NEW / APPROVED only
     * for money, and only while the customer has paid more than the total (an exchange for
     * something cheaper sends the order back to NEW with the difference still to give back).
     */
    @Transactional
    public OrderChange register(byte[] orderId, List<ReturnLine> lines, long refundMinor, String note) {
        Order order = orders.lockForUpdate(orderId);
        OrderStatus s = order.getStatus();
        boolean overpaidInWork = OrderTransitions.isOpen(s)
                && OrderMoney.overpaidMinor(order) > 0;
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED && !overpaidInWork) {
            throw OrderErrors.badRequest("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<ReturnLine> safeLines = lines == null ? List.of() : lines;
        if ((s == OrderStatus.REJECTED || overpaidInWork) && safeLines.stream().anyMatch(l -> l.quantity() > 0)) {
            throw OrderErrors.badRequest(s == OrderStatus.REJECTED
                    ? "по отклонённому заказу можно оформить только возврат денег"
                    : "заказ ещё не отправлен — можно вернуть только переплату");
        }
        if (overpaidInWork && refundMinor > OrderMoney.overpaidMinor(order)) {
            throw OrderErrors.badRequest("до отправки можно вернуть только переплату: " + MoneyFormat.uah(
                    OrderMoney.overpaidMinor(order)));
        }
        if (refundMinor < 0) {
            throw OrderErrors.badRequest("сумма возврата не может быть отрицательной");
        }
        long refundable = OrderMoney.refundableMinor(order);
        if (refundMinor > refundable) {
            throw OrderErrors.badRequest("вернуть можно не больше, чем получено: " + MoneyFormat.uah(refundable));
        }

        List<String> parts = new ArrayList<>();
        int units = 0;
        for (ReturnLine line : safeLines) {
            if (line.quantity() <= 0) {
                continue;
            }
            OrderItem item = ReturnText.item(order, line.itemId());
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw OrderErrors.badRequest("по позиции «" + item.getTitleSnapshot()
                        + "» можно вернуть не больше " + left + " шт.");
            }
            item.registerReturned(line.quantity());
            if (line.restock()) {
                // Never more than is still out of stock for this line.
                int canRestock = item.getQuantity() - item.getRestockedQty();
                stock.restockUnits(item, Math.min(line.quantity(), canRestock));
            }
            units += line.quantity();
            parts.add(item.getTitleSnapshot() + " ×" + line.quantity() + (line.restock() ? " (на склад)" : " (не на склад)"));
        }
        if (units == 0 && refundMinor == 0) {
            throw OrderErrors.badRequest("укажите, что вернули, или сумму возврата");
        }
        if (refundMinor > 0) {
            order.registerRefund(refundMinor);
            parts.add("возврат денег " + MoneyFormat.uah(refundMinor));
            moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, OrderMoneyMovement.Channel.OTHER,
                    refundMinor, OrderMoneyMovement.Source.ADMIN, null, note, null);
        }
        order.markReturned(clock.instant());
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        String details = "возврат: " + String.join(", ", parts)
                + (note == null || note.isBlank() ? "" : "; " + note.trim());
        return new OrderChange(saved, details);
    }

    /**
     * The wizard's checks without changing anything — run before monobank is asked for the refund,
     * so a refused plan never sends money and a refused refund never leaves half a return behind.
     */
    @Transactional(readOnly = true)
    public void checkPlan(byte[] orderId, ReturnPlan plan) {
        Order order = orders.get(orderId);
        ReturnPlanRules.validate(order, plan, () -> moneyLedger.retainedMinor(order.getId()), false);
        for (WizardLine line : plan.activeLines()) {
            OrderItem item = ReturnText.item(order, line.itemId());
            checkLeft(item, line);
        }
    }

    /** The wizard run without a monobank part sent before it. */
    @Transactional
    public OrderChange registerPlan(byte[] orderId, ReturnPlan plan, String adminName) {
        return registerPlan(orderId, plan, adminName, false);
    }

    /**
     * The return wizard: which units came back and in what state, how much money goes back and
     * through which channel, what the shop keeps.
     *
     * @param monoSent the monobank part was already accepted by the bank (checked by {@link #checkPlan} first):
     *                 it may already be booked as refunded, so it is left out of the limit here
     */
    @Transactional
    public OrderChange registerPlan(byte[] orderId, ReturnPlan plan, String adminName, boolean monoSent) {
        Order order = orders.lockForUpdate(orderId);
        ReturnPlanRules.validate(order, plan, () -> moneyLedger.retainedMinor(order.getId()), monoSent);
        OrderStatus s = order.getStatus();
        List<WizardLine> lines = plan.activeLines();
        List<ManualRefund> refunds = plan.activeRefunds();
        long manual = refunds.stream().mapToLong(ManualRefund::amountMinor).sum();
        String cleanNote = plan.cleanNote();

        List<String> parts = new ArrayList<>();
        List<String> customerParts = new ArrayList<>();
        List<OrderReturnLine> recordLines = new ArrayList<>();
        int units = 0;
        for (WizardLine line : lines) {
            OrderItem item = ReturnText.item(order, line.itemId());
            LineOutcome outcome = line.outcome() == null ? LineOutcome.RESTOCK : line.outcome();
            if (outcome != LineOutcome.KEPT) {
                checkLeft(item, line);
            }
            String title = ReturnText.title(item);
            OrderReturnLine rl = new OrderReturnLine();
            rl.setItemId(item.getId());
            rl.setQuantity(line.quantity());
            rl.setOutcome(outcome.name());
            recordLines.add(rl);
            switch (outcome) {
                case RESTOCK -> {
                    item.registerReturned(line.quantity());
                    int canRestock = item.getQuantity() - item.getRestockedQty();
                    int restocked = Math.min(line.quantity(), canRestock);
                    stock.restockUnits(item, restocked);
                    rl.setRestockedQty(restocked);
                    parts.add(title + " ×" + line.quantity() + " (на склад)");
                    customerParts.add(title + " ×" + line.quantity());
                }
                case DEFECT -> {
                    item.registerReturned(line.quantity());
                    StockWriteoff w = defects.writeOff(item, line.quantity(), OrderMoney.unitPaidMinor(order, item),
                            order.getId(), cleanNote, adminName);
                    rl.setDefectQty(line.quantity());
                    rl.setWriteoffId(w == null ? null : w.getId());
                    parts.add(title + " ×" + line.quantity() + " (брак, списан)");
                    customerParts.add(title + " ×" + line.quantity());
                }
                case KEPT -> parts.add(title + " ×" + line.quantity() + " (осталось у покупателя, компенсация)");
                case IN_TRANSIT -> {
                    item.registerSentBack(line.quantity());
                    order.markUnitsSentBack(clock.instant());
                    parts.add(title + " ×" + line.quantity() + " (едет назад)");
                    customerParts.add(title + " ×" + line.quantity());
                }
            }
            units += line.quantity();
        }
        if (units == 0 && manual == 0 && plan.monoRefundMinor() == 0 && plan.retainMinor() == 0) {
            throw OrderErrors.badRequest("укажите, что вернули, или сумму возврата");
        }
        if (s == OrderStatus.SHIPPED) {
            // Partial pickup: what the customer refused at the branch is never paid for.
            long refused = PartialPickup.refusedValueMinor(order, lines, true);
            if (refused > 0) {
                order.registerUncollected(refused);
                parts.add("не выкуплено на почте " + MoneyFormat.uah(refused) + ", наложка теперь "
                        + MoneyFormat.uah(OrderMoney.codMinor(order)));
            }
        }
        for (ManualRefund r : refunds) {
            order.registerRefund(r.amountMinor());
            parts.add("возврат " + MoneyFormat.uah(r.amountMinor()) + " (" + MoneyLedger.channelLabel(r.channel()) + ")");
            moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, r.channel(), r.amountMinor(),
                    OrderMoneyMovement.Source.ADMIN, adminName, r.note() == null ? cleanNote : r.note(), null);
        }
        if (plan.monoRefundMinor() > 0) {
            parts.add("на карту через monobank " + MoneyFormat.uah(plan.monoRefundMinor()) + " (запрошено)");
        }
        if (plan.retainMinor() > 0) {
            parts.add("удержано " + MoneyFormat.uah(plan.retainMinor()) + " (доставка)");
            moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.RETAINED, OrderMoneyMovement.Channel.OTHER,
                    plan.retainMinor(), OrderMoneyMovement.Source.ADMIN, adminName,
                    cleanNote == null ? "удержано: доставка" : cleanNote, null);
        }
        order.markReturned(clock.instant());
        Order saved = orders.save(order);
        saveRecord(order, plan, refunds, manual, cleanNote, adminName, recordLines);
        long refundedNow = manual + plan.monoRefundMinor();
        events.publish(new OrderEvents.Returned(saved.getId(), plan.notifyCustomer(),
                String.join(", ", customerParts), refundedNow));
        String details = "возврат: " + String.join(", ", parts) + (cleanNote == null ? "" : "; " + cleanNote);
        return new OrderChange(saved, details);
    }

    /** The wizard run as a record, so it can be cancelled later (V70). */
    private void saveRecord(Order order, ReturnPlan plan, List<ManualRefund> refunds, long manual, String cleanNote,
                            String adminName, List<OrderReturnLine> recordLines) {
        OrderReturn rec = new OrderReturn();
        rec.setCreatedAt(clock.instant());
        rec.setOrderId(order.getId());
        rec.setRefundMinor(manual);
        rec.setRefundChannel(refunds.isEmpty() ? null : refunds.get(0).channel().name());
        rec.setMonoRefundMinor(plan.monoRefundMinor());
        rec.setNote(cleanNote == null ? null : ReturnText.cut(cleanNote, 500));
        rec.setAdminName(adminName);
        OrderReturn savedRec = returnRecords.save(rec);
        if (savedRec != null && savedRec.getId() != null && !recordLines.isEmpty()) {
            recordLines.forEach(l -> l.setReturnId(savedRec.getId()));
            returnLines.saveAll(recordLines);
        }
    }

    private static void checkLeft(OrderItem item, WizardLine line) {
        int left = item.getQuantity() - item.getReturnedQty();
        if (line.outcome() != LineOutcome.KEPT && line.quantity() > left) {
            throw OrderErrors.badRequest("по позиции «" + item.getTitleSnapshot()
                    + "» можно вернуть не больше " + left + " шт.");
        }
    }
}
