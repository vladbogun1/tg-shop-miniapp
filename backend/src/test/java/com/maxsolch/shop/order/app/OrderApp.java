package com.maxsolch.shop.order.app;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.gift.CaseLowMargin;
import com.maxsolch.shop.gift.GiftRegistryService;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.inventory.app.OrderStock;
import com.maxsolch.shop.tg.NotificationService;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;

import static org.mockito.ArgumentMatchers.any;
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
    private final CancelRequests cancelRequests;
    private final OrderLifecycle lifecycle;
    private final OrderEditing editing;
    private final OrderPromos promos;
    private final OrderGiftCases giftCases;
    private final Checkout checkout;

    private OrderApp(OrderOps ops, OrderPayments payments, OrderArchive archive, CancelRequests cancelRequests,
                     OrderLifecycle lifecycle, OrderEditing editing, OrderPromos promos,
                     OrderGiftCases giftCases, Checkout checkout) {
        this.ops = ops;
        this.payments = payments;
        this.archive = archive;
        this.cancelRequests = cancelRequests;
        this.lifecycle = lifecycle;
        this.editing = editing;
        this.promos = promos;
        this.giftCases = giftCases;
        this.checkout = checkout;
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
        com.maxsolch.shop.payment.app.OnlinePaymentService paymentService =
                mock(com.maxsolch.shop.payment.app.OnlinePaymentService.class);
        // The real rule (PROCESSING / HOLD invoice) over the stubbed repository, so archive tests keep their meaning.
        if (invoices != null) {
            lenient().when(paymentService.hasPaymentInFlight(any())).thenAnswer(inv ->
                    invoices.findByOrderIdOrderByCreatedAtDesc(inv.getArgument(0)).stream().anyMatch(i ->
                            com.maxsolch.shop.payment.domain.PaymentInvoice.PROCESSING.equals(i.getStatus())
                                    || com.maxsolch.shop.payment.domain.PaymentInvoice.HOLD.equals(i.getStatus())));
        }
        OrderOnlinePayments onlinePayments = new com.maxsolch.shop.payment.app.OrderPaymentsAdapter(
                paymentService, invoices, mock(com.maxsolch.shop.payment.domain.MonobankGateway.class), Clock.systemUTC());
        OrderPayments payments = new OrderPayments(ops, orders, events);
        OrderArchive archive = new OrderArchive(ops, orders, events, onlinePayments);
        CancelRequests cancelRequests = new CancelRequests(ops, orders, stock, events, messages);
        OrderLifecycle lifecycle = new OrderLifecycle(ops, orders, stock, events,
                new AppProperties());
        OrderPromos orderPromos = new OrderPromos(ops, new com.maxsolch.shop.promo.app.PromoUses(promos), promoService, messages, lowMargin);
        OrderEditing editing = new OrderEditing(ops, orders, products, stock, events, gift, orderPromos);
        OrderGiftPrizes prizes = new OrderGiftPrizes(ops, registry, stock);
        OrderGiftCases giftCases = new OrderGiftCases(ops, orders, products, stock, events, messages, gift, orderPromos,
                prizes);
        Checkout checkout = new Checkout(orders, products, new com.maxsolch.shop.payment.app.OrderPaymentOptionsAdapter(options), events, orderPromos, carts, messages,
                stock, payments, gift, ops, prizes, new AppProperties());
        return new OrderApp(ops, payments, archive, cancelRequests, lifecycle, editing, orderPromos, giftCases,
                checkout);
    }

    public OrderGiftCases giftCases() {
        return giftCases;
    }

    public Checkout checkout() {
        return checkout;
    }

    public OrderPayments payments() {
        return payments;
    }

    public OrderArchive archive() {
        return archive;
    }

    public OrderEditing editing() {
        return editing;
    }

    public OrderPromos promos() {
        return promos;
    }

    public OrderLifecycle lifecycle() {
        return lifecycle;
    }

    public CancelRequests cancelRequests() {
        return cancelRequests;
    }

    /** The merge scenario over the same ops, with its own repository / events / ledger mocks. */
    public OrderMerge merge(OrderRepository orders, ApplicationEventPublisher events, MoneyLedger ledger) {
        return new OrderMerge(orders, ops, events, ledger);
    }

    public OrderDeliveryEditing deliveryEditing(OrderRepository orders, ApplicationEventPublisher events) {
        return new OrderDeliveryEditing(ops, orders, events);
    }

    OrderOps ops() {
        return ops;
    }

    /** The order lookup the returns scenarios use (read, row lock, save) over the same ops. */
    public OrderLookup lookup(OrderRepository orders) {
        return new OrderLookup(orders, ops);
    }
}
