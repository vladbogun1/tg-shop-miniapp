package com.maxsolch.shop.order.app;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.gift.CaseLowMargin;
import com.maxsolch.shop.gift.GiftRegistryService;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.payment.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.service.OrderStock;
import com.maxsolch.shop.tg.NotificationService;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;

import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

/**
 * The order scenarios of the module wired over the unit tests' mocks, the way Spring wires them. The gift /
 * invoice collaborators default to "no gift configured, no monthly limit, no low-margin products, no invoices"
 * (what the code did when they were absent).
 */
public final class OrderApp {

    private final OrderOps ops;
    private final OrderPayments payments;
    private final OrderArchive archive;
    private final OrderService service;

    private OrderApp(OrderOps ops, OrderPayments payments, OrderArchive archive, OrderService service) {
        this.ops = ops;
        this.payments = payments;
        this.archive = archive;
        this.service = service;
    }

    public static GiftRegistryService unlimitedRegistry() {
        GiftRegistryService registry = mock(GiftRegistryService.class);
        lenient().when(registry.remainingMinor(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(Long.MAX_VALUE);
        return registry;
    }

    public static CaseLowMargin noLowMargin() {
        CaseLowMargin lowMargin = mock(CaseLowMargin.class);
        lenient().when(lowMargin.none()).thenReturn(true);
        return lowMargin;
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options, NotificationService notifications,
                                  ApplicationEventPublisher events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger) {
        return create(orders, products, promos, options, notifications, events, promoService, carts, messages, em,
                stock, ledger, mock(PaymentInvoiceRepository.class), mock(GiftService.class), unlimitedRegistry(),
                noLowMargin());
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options, NotificationService notifications,
                                  ApplicationEventPublisher events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger,
                                  PaymentInvoiceRepository invoices, GiftService gift, GiftRegistryService registry,
                                  CaseLowMargin lowMargin) {
        OrderOps ops = new OrderOps(orders, em, ledger, gift, events, messages, Clock.systemUTC());
        OrderPayments payments = new OrderPayments(ops, orders, events);
        OrderArchive archive = new OrderArchive(ops, orders, events, invoices);
        OrderService service = new OrderService(orders, products, promos, options, notifications, events,
                promoService, carts, messages, em, stock, ledger, payments, gift, registry, lowMargin);
        return new OrderApp(ops, payments, archive, service);
    }

    public OrderService service() {
        return service;
    }

    public OrderPayments payments() {
        return payments;
    }

    public OrderArchive archive() {
        return archive;
    }

    OrderOps ops() {
        return ops;
    }

    /** The adjustment service over the same scenarios (its own stock / ledger mocks, as the tests pass them). */
    public OrderAdjustmentService adjustment(OrderRepository orders, OrderStock stock, ApplicationEventPublisher events,
                                             OrderExchangeRepository exchanges, MoneyLedger ledger) {
        return new OrderAdjustmentService(orders, service, payments, stock, events, exchanges, ledger);
    }
}
