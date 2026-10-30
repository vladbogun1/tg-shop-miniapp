package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderPayments;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.OrderExchange;
import com.maxsolch.shop.returns.domain.OrderExchangeLine;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.returns.infra.OrderExchangeLineRepository;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * Exchange on a delivered order (V69): the delivered order is NOT reopened. It keeps its status, ТТН, delivery date
 * and receipt; the units the customer gives back are registered like any return — on their way by post («Едет
 * назад», accepted later with «Посылка вернулась») or already at the shop (stock / write-off). The goods sent
 * instead form a NEW order linked to this one, shipped with its own ТТН.
 *
 * <p>Money: the paid value of the returned units is moved to the replacement through the money journal (REFUND
 * «зачёт в обмен» here, PAYMENT on the new order, both channel EXCHANGE), so the sale is not counted twice. A
 * dearer replacement leaves the difference to pay on the new order (наложка or online); a cheaper one leaves the
 * rest refundable here, for the return wizard.
 */
@Service
public class Exchanges {

    private final OrderLookup orders;
    private final Checkout checkout;
    private final OrderPayments orderPayments;
    private final MoneyLedger moneyLedger;
    private final Returns returns;
    private final OrderExchangeRepository exchangeRepository;
    private final OrderExchangeLineRepository exchangeLines;
    private final OrderReturnRepository returnRecords;
    private final DomainEvents events;
    private final Clock clock;

    public Exchanges(OrderLookup orders, Checkout checkout, OrderPayments orderPayments, MoneyLedger moneyLedger,
                     Returns returns, OrderExchangeRepository exchangeRepository,
                     OrderExchangeLineRepository exchangeLines, OrderReturnRepository returnRecords,
                     DomainEvents events, Clock clock) {
        this.orders = orders;
        this.checkout = checkout;
        this.orderPayments = orderPayments;
        this.moneyLedger = moneyLedger;
        this.returns = returns;
        this.exchangeRepository = exchangeRepository;
        this.exchangeLines = exchangeLines;
        this.returnRecords = returnRecords;
        this.events = events;
        this.clock = clock;
    }

    /** One line going out instead of the returned goods. */
    public record NewLine(String productId, String variantId, int quantity) {
    }

    /** Where the replacement order of an exchange starts: «Новый» (default) or straight «Одобрен». */
    public static boolean isTarget(OrderStatus s) {
        return s == OrderStatus.NEW || s == OrderStatus.APPROVED;
    }

    /**
     * @param returned what the customer gives back (no outcome = on its way by post)
     * @param given    what goes out instead
     * @param target   where the replacement order starts; null = «Новый»
     * @return the replacement order and the audit text
     */
    @Transactional
    public OrderChange exchange(byte[] orderId, List<WizardLine> returned, List<NewLine> given, OrderStatus target,
                                boolean notifyCustomer, String note, String adminName) {
        Order order = orders.lockForUpdate(orderId);
        if (order.getStatus() != OrderStatus.DELIVERED) {
            throw OrderErrors.badRequest(order.getStatus() == OrderStatus.SHIPPED
                    ? "посылка ещё не у покупателя — обмен оформляется после доставки (не забрали — отклоните заказ с «Посылка едет назад»)"
                    : "обмен оформляется для доставленного заказа");
        }
        OrderStatus to = target == null ? OrderStatus.NEW : target;
        if (!isTarget(to)) {
            throw OrderErrors.badRequest("новый заказ обмена начинается с «Новый» или «Одобрен»");
        }
        // No outcome = the unit is sent back by post (the usual case for an exchange).
        List<WizardLine> back = returned == null ? List.of()
                : returned.stream().filter(l -> l.quantity() > 0)
                        .map(l -> l.outcome() == null ? new WizardLine(l.itemId(), l.quantity(), LineOutcome.IN_TRANSIT) : l)
                        .toList();
        List<NewLine> out = given == null ? List.of()
                : given.stream().filter(l -> l.quantity() > 0).toList();
        if (back.isEmpty()) {
            throw OrderErrors.badRequest("отметьте, что покупатель вернул");
        }
        if (out.isEmpty()) {
            throw OrderErrors.badRequest("выберите товар на замену");
        }
        String cleanNote = ReturnText.cleanNote(note);
        if (cleanNote != null && cleanNote.length() > 500) {
            throw OrderErrors.badRequest("комментарий длиннее 500 символов");
        }

        // 1. What comes back and what it was paid for (checked again by the return below).
        long credit = 0;
        List<String> backParts = new ArrayList<>();
        List<OrderExchangeLine> backLines = new ArrayList<>();
        Map<OrderItem, Integer> exchangeBackUnits = new IdentityHashMap<>();
        for (WizardLine line : back) {
            LineOutcome outcome = line.outcome();
            if (outcome == LineOutcome.KEPT) {
                throw OrderErrors.badRequest("при обмене товар возвращается: едет назад, на склад или в брак");
            }
            OrderItem item = ReturnText.item(order, line.itemId());
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw OrderErrors.badRequest("по позиции «" + item.getTitleSnapshot()
                        + "» можно обменять не больше " + left + " шт.");
            }
            // units of the same item listed twice follow each other, so they don't share the same range
            int alreadyBack = item.getReturnedQty() + exchangeBackUnits.merge(item, 0, Integer::sum);
            long unit = OrderMoney.unitPaidMinor(order, item);
            credit += OrderMoney.paidForUnitsMinor(order, item, alreadyBack, line.quantity());
            exchangeBackUnits.merge(item, line.quantity(), Integer::sum);
            String title = ReturnText.title(item);
            backParts.add(title + " ×" + line.quantity() + switch (outcome) {
                case RESTOCK -> " (на склад)";
                case DEFECT -> " (брак, списан)";
                default -> " (едет назад)";
            });
            OrderExchangeLine el = new OrderExchangeLine();
            el.setProductId(item.getProductId());
            el.setVariantId(item.getVariantId());
            el.setTitle(ReturnText.cut(title, 255));
            el.setQuantity(line.quantity());
            el.setUnitPriceMinor(unit);
            el.setOutcome(outcome.name());
            backLines.add(el);
        }

        // 2. The replacement: a new order of the same customer and address, no gift, no deadline.
        String shortId = ReturnText.shortId(order.getId());
        Order child = checkout.createExchangeOrder(order,
                out.stream().map(l -> new CreateOrderCommand.Line(l.productId(), l.variantId(), l.quantity())).toList(),
                adminName);
        String childShort = ReturnText.shortId(child.getId());
        long retainedBefore = moneyLedger.retainedMinor(order.getId());
        long moved = Math.max(0, Math.min(Math.min(credit, OrderMoney.refundableMinor(order) - retainedBefore),
                child.getTotalMinor()));
        if (moved > 0) {
            child = orderPayments.markPaid(child.getId(), moved, OrderMoneyMovement.Channel.EXCHANGE, adminName,
                    "зачёт по обмену из заказа #" + shortId);
        }
        child.setExchangeOfOrderId(order.getId());
        child.setUserId(order.getUserId());
        // The customer chooses how to pay the difference: online in the order («Доплатити», the whole
        // rest through monobank) or наложкой on delivery. A prepayment snapshot would cap the online part.
        child.setPrepaymentMinor(0);
        if (to == OrderStatus.APPROVED) {
            child.approve(clock.instant());
        }
        child = orders.save(child);

        // 3. This order: the units come back (or are on their way), their paid value moves over.
        List<ManualRefund> refunds = moved > 0
                ? List.of(new ManualRefund(OrderMoneyMovement.Channel.EXCHANGE, moved, "зачёт в обмен, заказ #" + childShort))
                : List.of();
        returns.registerPlan(order.getId(), new ReturnPlan(back, refunds, 0, 0,
                cleanNote == null ? "обмен, новый заказ #" + childShort : cleanNote, false), adminName, false);

        List<String> outParts = child.getItems().stream()
                .map(i -> ReturnText.title(i) + " ×" + i.getQuantity())
                .toList();
        OrderExchange ex = new OrderExchange();
        ex.setCreatedAt(clock.instant());
        ex.setOrderId(order.getId());
        ex.setNewOrderId(child.getId());
        ex.setPreviousStatus(order.getStatus().name());
        ex.setPreviousTracking(order.getTrackingNumber());
        ex.setReturnedSummary(ReturnText.cut(String.join("; ", backParts), 2000));
        ex.setGivenSummary(ReturnText.cut(String.join("; ", outParts), 2000));
        ex.setTotalBeforeMinor(credit);
        ex.setTotalAfterMinor(child.getTotalMinor());
        ex.setNote(cleanNote);
        ex.setAdminName(adminName);
        OrderExchange savedEx = exchangeRepository.save(ex);
        if (savedEx != null && savedEx.getId() != null) {
            backLines.forEach(l -> l.setExchangeId(savedEx.getId()));
            exchangeLines.saveAll(backLines);
        }
        if (savedEx != null) {
            // The return registered above belongs to this exchange: cancelling it cancels the exchange.
            List<OrderReturn> recs = returnRecords.findByOrderIdOrderByIdAsc(order.getId());
            if (!recs.isEmpty()) {
                OrderReturn rec = recs.get(recs.size() - 1);
                rec.setKind(OrderReturn.Kind.EXCHANGE.name());
                rec.setExchangeId(savedEx.getId());
                returnRecords.save(rec);
            }
        }

        events.publish(new OrderEvents.Exchanged(child.getId(), notifyCustomer, String.join(", ", outParts)));

        long due = child.getTotalMinor() - moved;
        long over = credit - moved;
        String details = "обмен: вернули " + String.join(", ", backParts)
                + "; взамен новый заказ #" + childShort + " (" + String.join(", ", outParts) + ") на "
                + MoneyFormat.uah(child.getTotalMinor())
                + "; зачтено " + MoneyFormat.uah(moved)
                + (due > 0 ? "; доплата " + MoneyFormat.uah(due) : "")
                + (over > 0 ? "; к возврату " + MoneyFormat.uah(over) + " (кнопка «Возврат» в заказе #" + shortId + ")" : "")
                + (cleanNote == null ? "" : "; " + cleanNote);
        return new OrderChange(child, details);
    }
}
