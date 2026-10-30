package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderEvents;
import com.maxsolch.shop.order.app.OrderLifecycle;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.inventory.app.StockWriteoffs;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.OrderExchange;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
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
 * The customer changed their mind (V70): the newest return or exchange of an order is undone, and the money of a
 * cancelled return the customer still owed is booked when it arrives. Nothing is deleted: the record is stamped
 * as cancelled.
 */
@Service
public class ReturnCancellation {

    private final OrderLookup orders;
    private final OrderLifecycle lifecycle;
    private final OrderStock stock;
    private final MoneyLedger moneyLedger;
    private final StockWriteoffs writeoffs;
    private final OrderReturnRepository returnRecords;
    private final OrderReturnLineRepository returnLines;
    private final OrderExchangeRepository exchangeRepository;
    private final DomainEvents events;
    private final Clock clock;

    public ReturnCancellation(OrderLookup orders, OrderLifecycle lifecycle, OrderStock stock, MoneyLedger moneyLedger,
                              StockWriteoffs writeoffs, OrderReturnRepository returnRecords,
                              OrderReturnLineRepository returnLines, OrderExchangeRepository exchangeRepository,
                              DomainEvents events, Clock clock) {
        this.orders = orders;
        this.lifecycle = lifecycle;
        this.stock = stock;
        this.moneyLedger = moneyLedger;
        this.writeoffs = writeoffs;
        this.returnRecords = returnRecords;
        this.returnLines = returnLines;
        this.exchangeRepository = exchangeRepository;
        this.events = events;
        this.clock = clock;
    }

    /** What happens to the money the cancelled return gave back. */
    public enum CancelMoney {
        /** The customer has already sent it back: booked now. */
        RETURNED,
        /** Not back yet: the order shows the customer's debt until «Деньги пришли». */
        DEBT,
        /** The shop lets the customer keep it. */
        KEEP
    }

    /**
     * Undoes the newest return (or exchange) of the order. The units go back into the order (those put on the shelf
     * are taken off it again, write-offs are reversed), the money is booked back / left as the customer's debt /
     * left with them, and an exchange also cancels its replacement order (rejected, its stock released, the moved
     * credit comes back).
     */
    @Transactional
    public OrderChange cancel(byte[] orderId, long returnId, CancelMoney money, String note, String adminName) {
        Order order = orders.lockForUpdate(orderId);
        String cleanNote = note == null ? "" : note.trim();
        if (cleanNote.length() < 3) {
            throw OrderErrors.badRequest("напишите, почему отменяете (хотя бы 3 символа)");
        }
        cleanNote = ReturnText.cut(cleanNote, 500);
        List<OrderReturn> recs = returnRecords.findByOrderIdOrderByIdAsc(order.getId());
        OrderReturn rec = recs.stream().filter(x -> x.getId() != null && x.getId() == returnId).findFirst()
                .orElseThrow(() -> OrderErrors.notFound("возврат не найден"));
        if (rec.getCancelledAt() != null) {
            throw OrderErrors.badRequest("этот возврат уже отменён");
        }
        OrderReturn last = recs.stream().filter(x -> x.getCancelledAt() == null).reduce((a, b) -> b).orElse(null);
        if (last != rec) {
            throw OrderErrors.badRequest("отменить можно только последний возврат по заказу — сначала отмените более поздний");
        }
        boolean exchange = OrderReturn.Kind.EXCHANGE.name().equals(rec.getKind());
        List<String> parts = new ArrayList<>();
        // A monobank refund the bank has not confirmed yet is not in «возвращено» — never reverse more.
        long given = exchange ? 0
                : Math.min(rec.getRefundMinor() + rec.getMonoRefundMinor(), Math.max(0, order.getRefundedMinor()));
        if (given > 0 && money == null) {
            throw OrderErrors.badRequest("скажите, что с деньгами: вернул покупатель, должен или оставляем ему");
        }

        long creditBack = exchange ? cancelReplacement(order, rec, adminName, parts) : 0;
        long refusedBack = putGoodsBack(order, recs, rec, exchange, adminName, parts);
        if (refusedBack > 0 && order.getUncollectedMinor() > 0) {
            long back = Math.min(refusedBack, order.getUncollectedMinor());
            order.setUncollectedMinor(order.getUncollectedMinor() - back);
            parts.add("снова к оплате наложкой " + MoneyFormat.uah(back));
        }
        boolean otherPosted = otherTransitLines(recs, rec);
        boolean anyPending = order.getItems().stream().anyMatch(i -> i.getReturnPendingQty() > 0);
        if (!anyPending && order.getStatus() != OrderStatus.REJECTED) {
            order.setReturnStatus(otherPosted ? Order.RETURN_RECEIVED : null);
            if (!otherPosted) {
                order.setReturnSentAt(null);
                order.setReturnReceivedAt(null);
            }
        }
        if (order.getStatus() != OrderStatus.REJECTED && order.getItems().stream().allMatch(i -> i.getReturnedQty() <= 0)) {
            // Nothing is returned any more — the timeline stops saying «Возврат оформлен».
            order.setReturnedAt(null);
        }

        // The money.
        if (exchange) {
            if (creditBack > 0) {
                bookMoneyBack(order, creditBack, OrderMoneyMovement.Channel.EXCHANGE, adminName, "обмен отменён");
            }
        } else if (given > 0) {
            switch (money) {
                case RETURNED -> {
                    bookMoneyBack(order, given, rec.backChannel(), adminName, "возврат отменён: деньги вернулись");
                    parts.add("деньги " + MoneyFormat.uah(given) + " вернулись");
                }
                case DEBT -> {
                    rec.setDebtMinor(given);
                    parts.add("покупатель должен вернуть " + MoneyFormat.uah(given));
                }
                case KEEP -> parts.add("деньги " + MoneyFormat.uah(given) + " оставили покупателю");
            }
        }

        rec.setCancelledAt(clock.instant());
        rec.setCancelledBy(adminName);
        rec.setCancelNote(cleanNote);
        returnRecords.save(rec);
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return new OrderChange(saved, (exchange ? "обмен отменён: " : "возврат отменён: ")
                + (parts.isEmpty() ? "без товара" : String.join(", ", parts)) + "; " + cleanNote);
    }

    /**
     * An exchange: the replacement goes away first, its moved credit comes back to the original order.
     *
     * @return the credit that came back
     */
    private long cancelReplacement(Order order, OrderReturn rec, String adminName, List<String> parts) {
        OrderExchange ex = rec.getExchangeId() == null ? null : exchangeRepository.findById(rec.getExchangeId()).orElse(null);
        Order child = ex == null || ex.getNewOrderId() == null ? null : orders.lockForUpdate(ex.getNewOrderId());
        String blocker = rec.cancelBlocker(child);
        if (blocker != null) {
            throw OrderErrors.badRequest(blocker);
        }
        long creditBack = 0;
        if (child != null) {
            long kept = OrderMoney.keptMinor(child);
            creditBack = Math.max(0, Math.min(rec.getRefundMinor(), kept));
            if (creditBack > 0) {
                child.setRefundedMinor(Math.max(0, child.getRefundedMinor()) + creditBack);
                moneyLedger.record(child.getId(), OrderMoneyMovement.Kind.REFUND, OrderMoneyMovement.Channel.EXCHANGE,
                        creditBack, OrderMoneyMovement.Source.ADMIN, adminName,
                        "обмен отменён, зачёт обратно в заказ #" + ReturnText.shortId(order.getId()), null);
            }
            orders.save(child);
            if (child.getStatus() != OrderStatus.REJECTED) {
                lifecycle.reject(child.getId(), "Обмен отменён", RejectReasonCode.OTHER, true);
            }
            parts.add("замена #" + ReturnText.shortId(child.getId()) + " отменена");
        }
        if (ex != null) {
            ex.setCancelledAt(clock.instant());
            ex.setCancelledBy(adminName);
            exchangeRepository.save(ex);
        }
        return creditBack;
    }

    /** Another active record still has units on their way back. */
    private boolean otherTransitLines(List<OrderReturn> recs, OrderReturn rec) {
        List<Long> otherIds = recs.stream().filter(x -> x != rec && x.getCancelledAt() == null).map(OrderReturn::getId).toList();
        return !otherIds.isEmpty() && returnLines.findByReturnIdInOrderByIdAsc(otherIds).stream()
                .anyMatch(l -> LineOutcome.IN_TRANSIT.name().equals(l.getOutcome()));
    }

    /**
     * The goods: back into the order (shelf units taken off again, write-offs reversed).
     *
     * @return the refused value that comes back into наложка, when the return was registered at the branch
     */
    private long putGoodsBack(Order order, List<OrderReturn> recs, OrderReturn rec, boolean exchange, String adminName,
                              List<String> parts) {
        // Registered while the parcel was at the branch (partial pickup): the refused value comes back into наложка.
        boolean pickup = !exchange && order.getShippedAt() != null && rec.getCreatedAt() != null
                && rec.getCreatedAt().isAfter(order.getShippedAt())
                && (order.getDeliveredAt() == null || rec.getCreatedAt().isBefore(order.getDeliveredAt()));
        long refusedBack = 0;
        for (OrderReturnLine l : returnLines.findByReturnIdInOrderByIdAsc(List.of(rec.getId()))) {
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == l.getItemId())
                    .findFirst().orElse(null);
            if (item == null) {
                continue;
            }
            if (pickup && !LineOutcome.KEPT.name().equals(l.getOutcome())) {
                // the record is the last one: before it the item had returnedQty - quantity units returned
                refusedBack += OrderMoney.paidForUnitsMinor(order, item, item.getReturnedQty() - l.getQuantity(), l.getQuantity());
            }
            if (LineOutcome.KEPT.name().equals(l.getOutcome())) {
                continue;
            }
            int pending = l.pendingQty();
            if (pending > 0) {
                item.setReturnPendingQty(Math.max(0, item.getReturnPendingQty() - pending));
            }
            if (l.getRestockedQty() > 0) {
                stock.takeBackUnits(item, l.getRestockedQty());
            }
            if (l.getDefectQty() > 0 && l.getWriteoffId() != null) {
                writeoffs.find(l.getWriteoffId())
                        .ifPresent(w -> writeoffs.undo(w, l.getDefectQty(), adminName, "возврат отменён"));
            }
            item.setReturnedQty(Math.max(0, item.getReturnedQty() - l.getQuantity()));
            parts.add(ReturnText.title(item) + " ×" + l.getQuantity() + " снова в заказе");
        }
        return refusedBack;
    }

    /** The customer sent back the money of a cancelled return they owed. */
    @Transactional
    public OrderChange settleDebt(byte[] orderId, long returnId, String adminName) {
        Order order = orders.lockForUpdate(orderId);
        OrderReturn rec = returnRecords.findByOrderIdOrderByIdAsc(order.getId()).stream()
                .filter(x -> x.getId() != null && x.getId() == returnId).findFirst()
                .orElseThrow(() -> OrderErrors.notFound("возврат не найден"));
        if (rec.getDebtMinor() <= 0 || rec.getDebtPaidAt() != null) {
            throw OrderErrors.badRequest("по этому возврату покупатель ничего не должен");
        }
        long amount = Math.min(rec.getDebtMinor(), Math.max(0, order.getRefundedMinor()));
        if (amount > 0) {
            bookMoneyBack(order, amount, rec.backChannel(), adminName, "долг по отменённому возврату вернули");
        }
        rec.setDebtPaidAt(clock.instant());
        returnRecords.save(rec);
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return new OrderChange(saved, "деньги по отменённому возврату пришли: " + MoneyFormat.uah(amount));
    }

    /** Money of a cancelled return came back: «возвращено» goes down, the journal gets a minus refund. */
    private void bookMoneyBack(Order order, long amount, OrderMoneyMovement.Channel channel, String adminName, String note) {
        order.setRefundedMinor(Math.max(0, order.getRefundedMinor() - amount));
        moneyLedger.record(order.getId(), OrderMoneyMovement.Kind.REFUND, channel, -amount,
                OrderMoneyMovement.Source.ADMIN, adminName, note, null);
    }
}
