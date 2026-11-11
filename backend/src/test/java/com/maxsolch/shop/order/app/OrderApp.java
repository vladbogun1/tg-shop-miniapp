package com.maxsolch.shop.order.app;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.promo.app.CaseLowMargin;
import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.gift.app.GiftRegistryService;
import com.maxsolch.shop.gift.app.GiftService;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.order.infra.OrderProperties;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import jakarta.persistence.EntityManager;
import com.maxsolch.shop.platform.tx.DomainEvents;

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

    /** Settings at their registered defaults: every {@code get(key, default)} answers the default. */
    public static com.maxsolch.shop.settings.app.SettingsService defaultSettings() {
        return mock(com.maxsolch.shop.settings.app.SettingsService.class, inv ->
                "get".equals(inv.getMethod().getName()) && inv.getArguments().length == 2
                        ? inv.getArgument(1)
                        : org.mockito.Answers.RETURNS_DEFAULTS.answer(inv));
    }

    /** The Nova Poshta directory says yes to every branch and keeps the client's name and kind. */
    public static DeliveryAddressCheck anyAddress() {
        DeliveryAddressCheck check = mock(DeliveryAddressCheck.class);
        lenient().when(check.check(any())).thenAnswer(inv -> {
            DeliveryAddressCheck.Address a = inv.getArgument(0);
            return new DeliveryAddressCheck.Resolved(a.serviceType() == null
                    ? com.maxsolch.shop.order.domain.NpServiceType.WAREHOUSE : a.serviceType(), null);
        });
        return check;
    }

    /** No waybills anywhere: nothing is handed over to Nova Poshta. */
    public static ParcelGuard noParcels() {
        return new ParcelGuard(ids -> java.util.Map.of());
    }

    public static CaseLowMargin noLowMargin() {
        CaseLowMargin lowMargin = mock(CaseLowMargin.class);
        lenient().when(lowMargin.none()).thenReturn(true);
        return lowMargin;
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options,
                                  DomainEvents events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger) {
        return create(orders, products, promos, options, events, promoService, carts, messages, em,
                stock, StockFixtures.shelf(products, messages), ledger);
    }

    /** With an explicit shelf, for tests that watch what the shelf does to lots and holds. */
    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options,
                                  DomainEvents events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, Stock shelf,
                                  MoneyLedger ledger) {
        return create(orders, products, promos, options, events, promoService, carts, messages, em,
                stock, shelf, ledger, mock(PaymentInvoiceRepository.class), mock(GiftService.class), unlimitedRegistry(),
                noLowMargin());
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options,
                                  DomainEvents events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger,
                                  PaymentInvoiceRepository invoices, GiftService gift, GiftRegistryService registry,
                                  CaseLowMargin lowMargin) {
        return create(orders, products, promos, options, events, promoService, carts, messages, em,
                stock, StockFixtures.shelf(products, messages), ledger, invoices, gift, registry, lowMargin);
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    public static OrderApp create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                                  PaymentOptionRepository options,
                                  DomainEvents events, PromoService promoService, CartService carts,
                                  Messages messages, EntityManager em, OrderStock stock, Stock shelf, MoneyLedger ledger,
                                  PaymentInvoiceRepository invoices, GiftService gift, GiftRegistryService registry,
                                  CaseLowMargin lowMargin) {
        OrderGifts gifts = new com.maxsolch.shop.gift.app.GiftForOrders(gift, registry, Clock.systemUTC());
        OrderOps ops = new OrderOps(orders, em, ledger, gifts, events, messages, Clock.systemUTC());
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
        com.maxsolch.shop.settings.app.SettingsService settings = defaultSettings();
        OrderLifecycle lifecycle = new OrderLifecycle(ops, orders, stock, events,
                new OrderProperties(), settings);
        OrderPromos orderPromos = new OrderPromos(ops, new com.maxsolch.shop.promo.app.PromoUses(promos), promoService, messages, lowMargin);
        OrderEditing editing = new OrderEditing(ops, orders, new com.maxsolch.shop.catalog.app.Products(products, org.mockito.Mockito.mock(com.maxsolch.shop.catalog.infra.ProductImageRepository.class)), stock, shelf, events, gifts, orderPromos,
                noParcels());
        OrderGiftPrizes prizes = new OrderGiftPrizes(gifts, shelf);
        OrderGiftCases giftCases = new OrderGiftCases(ops, orders, new com.maxsolch.shop.catalog.app.Products(products, org.mockito.Mockito.mock(com.maxsolch.shop.catalog.infra.ProductImageRepository.class)), stock, events, messages, gifts, orderPromos,
                prizes, noParcels());
        Checkout checkout = new Checkout(orders, new com.maxsolch.shop.catalog.app.Products(products, org.mockito.Mockito.mock(com.maxsolch.shop.catalog.infra.ProductImageRepository.class)), new com.maxsolch.shop.payment.app.OrderPaymentOptionsAdapter(options), events, orderPromos, carts, messages,
                stock, shelf, payments, gifts, ops, prizes, new OrderProperties(),
                mock(com.maxsolch.shop.customer.app.Customers.class),
                new CheckoutDelivery(anyAddress(), settings, orders, ops));
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
    public OrderMerge merge(OrderRepository orders, DomainEvents events, MoneyLedger ledger) {
        return new OrderMerge(orders, ops, events, ledger, org.mockito.Mockito.mock(OrderOnlinePayments.class));
    }

    public OrderDeliveryEditing deliveryEditing(OrderRepository orders, DomainEvents events) {
        return new OrderDeliveryEditing(ops, orders, events, noParcels());
    }

    OrderOps ops() {
        return ops;
    }

    /** The order lookup the returns scenarios use (read, row lock, save) over the same ops. */
    public OrderLookup lookup(OrderRepository orders) {
        return new OrderLookup(orders, ops);
    }
}
