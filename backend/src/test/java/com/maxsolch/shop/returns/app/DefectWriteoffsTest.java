package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.WizardLine;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** A written-off unit that turned out fine goes back on the shelf. */
class DefectWriteoffsTest extends ReturnsTestBase {

    @Test
    void restoreWriteoff_defectGoesBackOnTheShelf_andCancelThenTakesItFromThere() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 1);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        wireLedger();
        List<com.maxsolch.shop.returns.domain.OrderReturn> recs = new ArrayList<>();
        List<com.maxsolch.shop.returns.domain.OrderReturnLine> lines = wireReturnRecords(recs);
        List<com.maxsolch.shop.inventory.domain.StockWriteoff> saved = new ArrayList<>();
        when(writeoffs.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.inventory.domain.StockWriteoff w = inv.getArgument(0);
            if (w.getId() == null) {
                w.setId(77L);
                saved.add(w);
            }
            return w;
        });
        when(writeoffs.findById(77L)).thenAnswer(inv -> Optional.of(saved.get(0)));

        returns.registerPlan(o.getId(), plan(
                List.of(new WizardLine(1L, 1, LineOutcome.DEFECT)),
                List.of(), 0, 0), "owner");
        assertThat(lines.get(0).getWriteoffId()).isEqualTo(77L);
        assertThat(p.getStock()).isZero();

        defects.restore(77L, 1, "оказалось целым", "owner");
        assertThat(p.getStock()).isEqualTo(1);
        assertThat(saved.get(0).activeQty()).isZero();
        assertThat(lines.get(0).getDefectQty()).isZero();
        assertThat(lines.get(0).getRestockedQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isEqualTo(1);
        assertThatThrownBy(() -> defects.restore(77L, 1, null, "owner"))
                .isInstanceOf(DomainException.BadRequest.class);

        cancellation.cancel(o.getId(), recs.get(0).getId(), null, "передумал", "owner");
        assertThat(p.getStock()).isZero();
        assertThat(it.getReturnedQty()).isZero();
        assertThat(it.getRestockedQty()).isZero();
    }

    @Test
    void restoreWriteoff_withoutAnOrder_putsTheUnitsBackOnTheShelf_andRefusesTooMany() {
        Product p = product(1);
        com.maxsolch.shop.inventory.domain.StockWriteoff w = new com.maxsolch.shop.inventory.domain.StockWriteoff();
        w.setId(8L);
        w.setProductId(p.getId());
        w.setTitle("Мишка");
        w.setQuantity(3);
        when(writeoffs.findById(8L)).thenReturn(Optional.of(w));
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> defects.restore(8L, 4, null, "owner"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("от 1 до 3");
        String summary = defects.restore(8L, 2, " целая ", "owner");

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(w.getUndoneQty()).isEqualTo(2);
        assertThat(w.getUndoneBy()).isEqualTo("owner");
        assertThat(w.getUndoneNote()).isEqualTo("целая");
        assertThat(summary).isEqualTo("из брака на склад: Мишка ×2; целая");
        assertThatThrownBy(() -> defects.restore(404L, 1, null, "owner"))
                .isInstanceOf(DomainException.NotFound.class);
    }

}
