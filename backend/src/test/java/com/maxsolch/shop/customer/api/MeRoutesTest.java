package com.maxsolch.shop.customer.api;

import com.maxsolch.shop.analytics.api.MeAnalyticsController;
import com.maxsolch.shop.gift.api.MeGiftCaseController;
import com.maxsolch.shop.order.api.MeOrdersController;
import com.maxsolch.shop.payment.api.MeOrderPaymentController;
import com.maxsolch.shop.promo.api.MePromoController;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The customer API under {@code /api/me} was one controller and is now one per module that owns the thing. The URLs
 * (the Mini App and the site call them) and the customer-only guard must be exactly what they were.
 */
class MeRoutesTest {

    private static final Set<String> BEFORE = Set.of(
            "GET /api/me",
            "POST /api/me/locale",
            "POST /api/me/analytics",
            "POST /api/me/promo/reserve",
            "DELETE /api/me/promo/reserve",
            "GET /api/me/unread-count",
            "GET /api/me/conversations",
            "GET /api/me/orders",
            "GET /api/me/orders/{id}",
            "POST /api/me/orders/{id}/gift-case/open",
            "POST /api/me/orders/{id}/gift-case/swap",
            "POST /api/me/orders/{id}/gift-case/size",
            "GET /api/me/orders/{id}/messages",
            "POST /api/me/orders/{id}/messages",
            "GET /api/me/orders/{id}/receipts",
            "POST /api/me/orders/{id}/payment",
            "POST /api/me/orders/{id}/payment/refresh",
            "POST /api/me/orders/{id}/cancel",
            "POST /api/me/orders/{id}/cancel-request",
            "POST /api/me/orders/{id}/messages/read",
            "POST /api/me/uploads");

    private static final Class<?>[] CONTROLLERS = {MeController.class, MeAnalyticsController.class,
            MePromoController.class, MeOrdersController.class, MeGiftCaseController.class,
            MeOrderPaymentController.class};

    @Test
    void everyOldUrlIsStillServed_andNothingIsAdded() {
        Set<String> now = new TreeSet<>();
        for (Class<?> c : CONTROLLERS) {
            String prefix = c.getAnnotation(RequestMapping.class).value()[0];
            for (Method m : c.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm == null) {
                    continue;
                }
                RequestMethod verb = rm.method()[0];
                String path = rm.path().length == 0 ? "" : rm.path()[0];
                now.add(verb + " " + prefix + path);
            }
        }
        assertThat(now).containsExactlyInAnyOrderElementsOf(BEFORE);
    }

    @Test
    void everyControllerIsCustomerOnly() {
        for (Class<?> c : CONTROLLERS) {
            PreAuthorize guard = c.getAnnotation(PreAuthorize.class);
            assertThat(guard).as(c.getSimpleName()).isNotNull();
            assertThat(guard.value()).isEqualTo("hasRole('CUSTOMER')");
        }
    }
}
