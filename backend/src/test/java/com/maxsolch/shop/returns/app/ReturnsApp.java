package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderApp;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import com.maxsolch.shop.returns.infra.OrderExchangeLineRepository;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.order.app.OrderStock;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;

import static org.mockito.Mockito.mock;

/** The returns scenarios of the module wired over the unit tests' mocks, the way Spring wires them. */
public final class ReturnsApp {

    public final DefectWriteoffs defects;
    public final Returns returns;
    public final ReturnReceiving receiving;
    public final Exchanges exchanges;
    public final ReturnCancellation cancellation;

    private ReturnsApp(DefectWriteoffs defects, Returns returns, ReturnReceiving receiving, Exchanges exchanges,
                       ReturnCancellation cancellation) {
        this.defects = defects;
        this.returns = returns;
        this.receiving = receiving;
        this.exchanges = exchanges;
        this.cancellation = cancellation;
    }

    /** With empty mocks for the write-off, return-record and exchange-line repositories. */
    public static ReturnsApp create(OrderApp app, OrderRepository orders, OrderStock stock, com.maxsolch.shop.inventory.app.Stock shelf,
                                    ApplicationEventPublisher events, MoneyLedger ledger,
                                    OrderExchangeRepository exchangeRepository) {
        return create(app, orders, stock, shelf, events, ledger, exchangeRepository, mock(StockWriteoffRepository.class),
                mock(OrderReturnRepository.class), mock(OrderReturnLineRepository.class),
                mock(OrderExchangeLineRepository.class));
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static ReturnsApp create(OrderApp app, OrderRepository orders, OrderStock stock, com.maxsolch.shop.inventory.app.Stock shelf,
                                    ApplicationEventPublisher events, MoneyLedger ledger,
                                    OrderExchangeRepository exchangeRepository, StockWriteoffRepository writeoffs,
                                    OrderReturnRepository returnRecords, OrderReturnLineRepository returnLines,
                                    OrderExchangeLineRepository exchangeLines) {
        OrderLookup lookup = app.lookup(orders);
        Clock clock = Clock.systemUTC();
        DefectWriteoffs defects = new DefectWriteoffs(writeoffs, returnLines, lookup, shelf, clock);
        Returns returns = new Returns(lookup, stock, ledger, defects, returnRecords, returnLines, events, clock);
        ReturnReceiving receiving = new ReturnReceiving(lookup, stock, defects, returnRecords, returnLines, events,
                clock);
        Exchanges exchanges = new Exchanges(lookup, app.checkout(), app.payments(), ledger, returns,
                exchangeRepository, exchangeLines, returnRecords, events, clock);
        ReturnCancellation cancellation = new ReturnCancellation(lookup, app.lifecycle(), stock, ledger, writeoffs,
                returnRecords, returnLines, exchangeRepository, events, clock);
        return new ReturnsApp(defects, returns, receiving, exchanges, cancellation);
    }
}
