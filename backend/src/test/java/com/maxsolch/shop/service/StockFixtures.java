package com.maxsolch.shop.service;

import com.maxsolch.shop.costing.LotLedger;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.preorder.PreorderQueueService;
import com.maxsolch.shop.repository.ProductRepository;

import static org.mockito.Mockito.mock;

/** An {@link OrderStock} for unit tests: the real stock arithmetic, lots and pre-order queue are mocks that do nothing. */
final class StockFixtures {

    private StockFixtures() {
    }

    static OrderStock stock(ProductRepository products, Messages messages) {
        return new OrderStock(products, messages, mock(LotLedger.class), mock(PreorderQueueService.class));
    }
}
