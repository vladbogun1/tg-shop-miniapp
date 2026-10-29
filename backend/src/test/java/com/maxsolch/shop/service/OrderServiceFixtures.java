package com.maxsolch.shop.service;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.promo.app.PromoService;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import com.maxsolch.shop.gift.CaseLowMargin;
import com.maxsolch.shop.gift.GiftRegistryService;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.payment.PaymentInvoiceRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;

/**
 * An {@link OrderService} for unit tests. The gift / invoice collaborators are constructor
 * dependencies now; the defaults here behave like "no gift configured, no monthly limit, no
 * low-margin products, no invoices" — what the service did when they were absent.
 */
final class OrderServiceFixtures {

    private OrderServiceFixtures() {
    }

    static GiftRegistryService unlimitedRegistry() {
        GiftRegistryService registry = mock(GiftRegistryService.class);
        lenient().when(registry.remainingMinor(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(Long.MAX_VALUE);
        return registry;
    }

    static CaseLowMargin noLowMargin() {
        CaseLowMargin lowMargin = mock(CaseLowMargin.class);
        lenient().when(lowMargin.none()).thenReturn(true);
        return lowMargin;
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    static OrderService create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                               PaymentOptionRepository options, NotificationService notifications,
                               ApplicationEventPublisher events, PromoService promoService, CartService carts,
                               Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger) {
        return create(orders, products, promos, options, notifications, events, promoService, carts, messages, em,
                stock, ledger, mock(PaymentInvoiceRepository.class), mock(GiftService.class), unlimitedRegistry(),
                noLowMargin());
    }

    @SuppressWarnings("checkstyle:ParameterNumber")
    static OrderService create(OrderRepository orders, ProductRepository products, PromoCodeRepository promos,
                               PaymentOptionRepository options, NotificationService notifications,
                               ApplicationEventPublisher events, PromoService promoService, CartService carts,
                               Messages messages, EntityManager em, OrderStock stock, MoneyLedger ledger,
                               PaymentInvoiceRepository invoices, GiftService gift, GiftRegistryService registry,
                               CaseLowMargin lowMargin) {
        return new OrderService(orders, products, promos, options, notifications, events, promoService, carts,
                messages, em, stock, ledger, invoices, gift, registry, lowMargin);
    }
}
