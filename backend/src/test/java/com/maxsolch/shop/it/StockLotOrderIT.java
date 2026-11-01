package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.inventory.infra.StockLotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FIFO rests on the order of the repository queries (oldest lot first = ascending id). The unit test of
 * the ledger feeds its own sorted list, so the real SQL order is pinned here.
 */
class StockLotOrderIT extends AbstractMysqlIT {

    @Autowired
    StockLotRepository lotRepository;

    @Test
    void lotsOfAProductComeOldestFirst_whateverTheirSizes() {
        Product p = product(10_000, 5, 1, 9); // three lots, the middle one the smallest

        List<StockLot> byKey = lotRepository.findKey(p.getId(), null);
        List<StockLot> byProduct = lotRepository.findByProductIdOrderByIdAsc(p.getId());

        assertThat(byKey).extracting(StockLot::getQtyLeft).containsExactly(5, 1, 9);
        assertThat(byProduct).extracting(StockLot::getQtyLeft).containsExactly(5, 1, 9);
        assertThat(byKey).extracting(StockLot::getId).isSorted().doesNotHaveDuplicates();
    }
}
