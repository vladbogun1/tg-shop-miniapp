package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderErrors;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
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

    private final StockWriteoffRepository writeoffs;
    private final OrderReturnLineRepository returnLines;
    private final OrderLookup orders;
    private final Stock stock;
    private final Clock clock;

    public DefectWriteoffs(StockWriteoffRepository writeoffs, OrderReturnLineRepository returnLines,
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
        StockWriteoff w = new StockWriteoff();
        w.setProductId(item.getProductId());
        w.setVariantId(item.getVariantId());
        w.setTitle(ReturnText.cut(ReturnText.title(item), 255));
        w.setQuantity(quantity);
        w.setReason(StockWriteoff.Reason.DEFECT.name());
        w.setNote(note == null ? null : ReturnText.cut(note, 500));
        w.setOrderId(orderId);
        w.setUnitValueMinor(unitValueMinor);
        w.setAdminName(adminName);
        return writeoffs.save(w);
    }

    /**
     * A written-off unit turned out fine (repaired, mis-sorted): back on the shelf. A return's
     * defect becomes a restocked unit of that return, so cancelling it later takes it off the shelf.
     */
    @Transactional
    public String restore(long writeoffId, int quantity, String note, String adminName) {
        StockWriteoff w = writeoffs.findById(writeoffId)
                .orElseThrow(() -> OrderErrors.notFound("списание не найдено"));
        int left = w.activeQty();
        if (left <= 0) {
            throw OrderErrors.badRequest("по этому списанию всё уже вернули");
        }
        if (quantity < 1 || quantity > left) {
            throw OrderErrors.badRequest("вернуть можно от 1 до " + left + " шт.");
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
                l.setDefectQty(l.getDefectQty() - take);
                l.setRestockedQty(l.getRestockedQty() + take);
                returnLines.save(l);
                OrderItem line = order.getItems().stream()
                        .filter(i -> i.getId() != null && i.getId() == l.getItemId()).findFirst().orElse(null);
                if (line != null) {
                    line.setRestockedQty(Math.min(line.getQuantity(), line.getRestockedQty() + take));
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
        w.setUndoneQty(w.getUndoneQty() + quantity);
        w.setUndoneAt(clock.instant());
        w.setUndoneBy(adminName);
        w.setUndoneNote(cleanNote == null ? "вернули на склад" : cleanNote);
        writeoffs.save(w);
        return "из брака на склад: " + w.getTitle() + " ×" + quantity + (cleanNote == null ? "" : "; " + cleanNote);
    }
}
