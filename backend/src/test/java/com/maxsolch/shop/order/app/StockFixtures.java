package com.maxsolch.shop.order.app;

import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.inventory.domain.StockHolds;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.preorder.app.PreorderQueueService;
import com.maxsolch.shop.catalog.infra.ProductRepository;

import static org.mockito.Mockito.mock;

/** Stock objects for unit tests: the real stock arithmetic, lots and pre-order queue are mocks that do nothing. */
public final class StockFixtures {

    private StockFixtures() {
    }

    /** The shelf ({@link Stock}) over the given repository; lots and holds do nothing. */
    public static Stock shelf(ProductRepository products, Messages messages) {
        return new Stock(products, messages, mock(LotLedger.class), mock(StockHolds.class));
    }

    /** The order-line side ({@link OrderStock}) over {@link #shelf}. */
    public static OrderStock stock(ProductRepository products, Messages messages) {
        return new OrderStock(products, shelf(products, messages), mock(PreorderQueueService.class));
    }
}
