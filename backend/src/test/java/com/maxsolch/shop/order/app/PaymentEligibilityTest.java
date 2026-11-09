package com.maxsolch.shop.order.app;

import com.maxsolch.shop.customer.app.CustomerFlags;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A «проблемный покупатель» pays the whole order online; everybody else chooses freely. */
class PaymentEligibilityTest {

    private static final String PREPAY = "11111111-1111-1111-1111-111111111111";
    private static final String FULL = "22222222-2222-2222-2222-222222222222";

    private final CustomerFlags flags = mock(CustomerFlags.class);
    private final OrderPaymentOptions options = mock(OrderPaymentOptions.class);
    private final PaymentEligibility eligibility = new PaymentEligibility(flags, options);

    {
        when(options.findActive(any())).thenAnswer(i -> {
            String id = UuidUtil.toString(i.getArgument(0));
            boolean prepay = PREPAY.equals(id);
            return Optional.of(new OrderPaymentOptions.Option(i.getArgument(0), prepay ? "Предоплата" : "Полная",
                    prepay, prepay ? 10000 : 0));
        });
    }

    @Test
    void markedBuyer_prepayment_refused() {
        when(flags.onlinePaymentOnly(7L)).thenReturn(true);

        assertThatThrownBy(() -> eligibility.requireAllowed(7L, PREPAY))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> org.assertj.core.api.Assertions.assertThat(((DomainException) e).errorCode())
                        .isEqualTo(OrderError.ONLINE_PAYMENT_ONLY));
    }

    @Test
    void markedBuyer_fullOnline_allowed() {
        when(flags.onlinePaymentOnly(7L)).thenReturn(true);

        assertThatCode(() -> eligibility.requireAllowed(7L, FULL)).doesNotThrowAnyException();
    }

    @Test
    void unmarkedBuyer_prepayment_allowed_withoutLookingUpTheOption() {
        when(flags.onlinePaymentOnly(7L)).thenReturn(false);

        assertThatCode(() -> eligibility.requireAllowed(7L, PREPAY)).doesNotThrowAnyException();
        verify(options, never()).findActive(any());
    }

    @Test
    void malformedOrMissingOption_leftToCheckout() {
        when(flags.onlinePaymentOnly(7L)).thenReturn(true);

        assertThatCode(() -> eligibility.requireAllowed(7L, "not-a-uuid")).doesNotThrowAnyException();
        assertThatCode(() -> eligibility.requireAllowed(7L, null)).doesNotThrowAnyException();
    }
}
