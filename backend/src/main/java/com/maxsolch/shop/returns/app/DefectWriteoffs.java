package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.ReturnsError;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.inventory.app.StockWriteoffs;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.inventory.app.Stock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

/**
 * Defects that came back with a return: writing the broken units off (report «Списания») and putting a written-off
 * unit back on the shelf when it turned out fine.
 */
@Service
public class DefectWriteoffs {

    private final StockWriteoffs writeoffs;
    private final OrderReturnLineRepository returnLines;
    private final OrderLookup orders;
    private final Stock stock;
    private final Clock clock;

    public DefectWriteoffs(StockWriteoffs writeoffs, OrderReturnLineRepository returnLines,
                           OrderLookup orders, Stock stock, Clock clock) {
        this.writeoffs = writeoffs;
        this.returnLines = returnLines;
        this.orders = orders;
        this.stock = stock;
        this.clock = clock;
    }

    /** Writes {@code quantity} units of the line off as defect; null when there is nothing to write off. */
    StockWriteoff writeOff(OrderItem item, int quantity, long unitValueMinor, byte[] orderId, String note,
                           String adminName) {
        if (quantity <= 0) {
            return null;
        }
        return writeoffs.record(item.getProductId(), item.getVariantId(), ReturnText.cut(ReturnText.title(item), 255),
                quantity, StockWriteoff.Reason.DEFECT, note == null ? null : ReturnText.cut(note, 500), orderId,
                unitValueMinor, adminName);
    }

    /**
     * A written-off unit turned out fine (repaired, mis-sorted): back on the shelf. A return's
     * defect becomes a restocked unit of that return, so cancelling it later takes it off the shelf.
     */
    @Transactional
    public String restore(long writeoffId, int quantity, String note, String adminName) {
        StockWriteoff w = writeoffs.require(writeoffId);
        int left = w.activeQty();
        if (left <= 0) {
            throw new DomainException.BadRequest(ReturnsError.WRITE_OFF_ALREADY_RETURNED);
        }
        if (quantity < 1 || quantity > left) {
            throw new DomainException.BadRequest(ReturnsError.QTY_OUT_OF_RANGE, String.valueOf(left));
        }
        String cleanNote = note == null || note.isBlank() ? null : ReturnText.cut(note.trim(), 500);
        int restored = 0; // units already put back through their order line
        if (w.getOrderId() != null) {
            Order order = orders.lockForUpdate(w.getOrderId());
            int move = quantity;
            for (OrderReturnLine l : returnLines.findByWriteoffId(w.getId())) {
                int take = Math.min(move, l.getDefectQty());
                if (take <= 0) {
                    continue;
                }
                l.defectToShelf(take);
                returnLines.save(l);
                OrderItem line = order.getItems().stream()
                        .filter(i -> i.getId() != null && i.getId() == l.getItemId()).findFirst().orElse(null);
                if (line != null) {
                    line.markRestocked(take);
                }
                // the units go back into the lots the order took them from, so their cost stays known
                stock.restockProduct(w.getProductId(), w.getVariantId(), take, line);
                restored += take;
                move -= take;
                if (move == 0) {
                    break;
                }
            }
            orders.save(order);
        }
        stock.restockProduct(w.getProductId(), w.getVariantId(), quantity - restored, null);
        writeoffs.undo(w, quantity, adminName, cleanNote == null ? "вернули на склад" : cleanNote);
        return "из брака на склад: " + w.getTitle() + " ×" + quantity + (cleanNote == null ? "" : "; " + cleanNote);
    }
}
