package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderEvents;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.order.app.OrderStock;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/** «Посылка вернулась»: the parcel the customer sent back arrives, units go to the shelf or to the write-offs. */
@Service
public class ReturnReceiving {

    private final OrderLookup orders;
    private final OrderStock stock;
    private final DefectWriteoffs defects;
    private final OrderReturnRepository returnRecords;
    private final OrderReturnLineRepository returnLines;
    private final DomainEvents events;
    private final Clock clock;

    public ReturnReceiving(OrderLookup orders, OrderStock stock, DefectWriteoffs defects,
                           OrderReturnRepository returnRecords, OrderReturnLineRepository returnLines,
                           DomainEvents events, Clock clock) {
        this.orders = orders;
        this.stock = stock;
        this.defects = defects;
        this.returnRecords = returnRecords;
        this.returnLines = returnLines;
        this.events = events;
        this.clock = clock;
    }

    /** One line of «Посылка вернулась»: units of this order line and what state they came in. */
    public record ReceivedLine(long itemId, int quantity, LineOutcome outcome) {
    }

    /**
     * The parcel is back at the shop ({@code return_status} IN_TRANSIT → RECEIVED): the refused
     * parcel of a rejected order, or the units of a delivered one the wizard sent «едет назад».
     * Sellable units go back on the shelf, broken ones are written off. Lines not listed come back
     * as sellable.
     */
    @Transactional
    public OrderChange receive(byte[] orderId, List<ReceivedLine> lines, String note, String adminName) {
        Order order = orders.lockForUpdate(orderId);
        if (!Order.RETURN_IN_TRANSIT.equals(order.getReturnStatus())) {
            throw OrderErrors.badRequest("заказ не ждёт возвращения посылки");
        }
        List<ReceivedLine> given = lines == null ? List.of() : lines;
        String cleanNote = ReturnText.cleanNote(note);
        boolean refused = order.getStatus() == OrderStatus.REJECTED;
        boolean anyPending = order.getItems().stream().anyMatch(i -> i.getReturnPendingQty() > 0);
        List<String> parts = new ArrayList<>();
        for (OrderItem item : order.getItems()) {
            // Units on their way back; a refused parcel from before the per-line count travels whole.
            int out = anyPending ? item.getReturnPendingQty()
                    : refused ? item.getQuantity() - Math.max(item.getReturnedQty(), item.getRestockedQty()) : 0;
            item.setReturnPendingQty(0);
            if (out <= 0) {
                continue;
            }
            int defect = given.stream()
                    .filter(l -> l.itemId() == (item.getId() == null ? -1 : item.getId())
                            && l.outcome() == LineOutcome.DEFECT)
                    .mapToInt(ReceivedLine::quantity).sum();
            defect = Math.max(0, Math.min(defect, out));
            int sellable = out - defect;
            String title = ReturnText.title(item);
            int restocked = 0;
            if (sellable > 0) {
                restocked = Math.min(sellable, item.getQuantity() - item.getRestockedQty());
                stock.restockUnits(item, restocked);
                parts.add(title + " ×" + sellable + " (на склад)");
            }
            StockWriteoff w = null;
            if (defect > 0) {
                if (refused) {
                    // A delivered order's returned units were counted when the return was registered.
                    item.setReturnedQty(item.getReturnedQty() + defect);
                }
                w = defects.writeOff(item, defect, OrderMoney.unitPaidMinor(order, item), order.getId(), cleanNote,
                        adminName);
                parts.add(title + " ×" + defect + " (брак, списан)");
            }
            settleInTransit(order, item, restocked, defect, w);
        }
        order.setReturnStatus(Order.RETURN_RECEIVED);
        order.setReturnReceivedAt(clock.instant());
        Order saved = orders.save(order);
        events.publish(OrderEvents.Edited.silent(saved.getId()));
        return new OrderChange(saved, "посылка вернулась: " + (parts.isEmpty() ? "без товара" : String.join(", ", parts))
                + (cleanNote == null ? "" : "; " + cleanNote));
    }

    /**
     * «Посылка вернулась» for one line: spreads what was put on the shelf / written off over the
     * return records still waiting for these units, oldest first (V70), so a cancel knows the split.
     */
    private void settleInTransit(Order order, OrderItem item, int restocked, int defect, StockWriteoff w) {
        if (item.getId() == null || restocked + defect <= 0) {
            return;
        }
        List<Long> ids = returnRecords.findByOrderIdOrderByIdAsc(order.getId()).stream()
                .filter(rec -> rec.getCancelledAt() == null).map(OrderReturn::getId).toList();
        if (ids.isEmpty()) {
            return;
        }
        for (OrderReturnLine l : returnLines.findByReturnIdInOrderByIdAsc(ids)) {
            if (l.getItemId() != item.getId() || l.pendingQty() <= 0) {
                continue;
            }
            int take = Math.min(restocked, l.pendingQty());
            l.setRestockedQty(l.getRestockedQty() + take);
            restocked -= take;
            int broken = Math.min(defect, l.pendingQty());
            if (broken > 0) {
                l.setDefectQty(l.getDefectQty() + broken);
                l.setWriteoffId(w == null ? null : w.getId());
                defect -= broken;
            }
            returnLines.save(l);
            if (restocked + defect <= 0) {
                break;
            }
        }
    }
}
