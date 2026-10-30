package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.payment.app.CustomerPaymentRefresh;
import com.maxsolch.shop.payment.app.OnlinePaymentService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The 5-second brake on asking monobank, per order, and who may ask. */
@ExtendWith(MockitoExtension.class)
class MeOrderPaymentRefreshTest {

    @Mock
    OrderRepository orders;
    @Mock
    OrderQueryService queries;
    @Mock
    OrderLookup lookup;
    @Mock
    Messages messages;
    @Mock
    OnlinePaymentService payments;

    Order order;
    String id;

    @BeforeEach
    void setUp() {
        order = new Order();
        order.setId(UuidUtil.randomBytes());
        order.setUserId(100L);
        id = UuidUtil.toString(order.getId());
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(orders.findById(any())).thenReturn(Optional.of(order));
        loginAs(100L);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    MeOrderPaymentController controller() {
        return new MeOrderPaymentController(new CustomerOrders(orders, messages), queries, lookup, payments,
                new CustomerPaymentRefresh(payments, java.time.Clock.systemUTC()), null, null, new CurrentActor());
    }

    private static void loginAs(long telegramUserId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(telegramUserId, Role.CUSTOMER), null, List.of()));
    }

    @Test
    void refreshPayment_asksBankOnce_perFiveSeconds_perOrder_butAlwaysReturnsFreshOrder() {
        OrderDetailDto dto = mock(OrderDetailDto.class);
        when(lookup.get(order.getId())).thenReturn(order);
        when(queries.toDetail(order, "uk")).thenReturn(dto);
        MeOrderPaymentController c = controller();

        assertThat(c.refreshPayment(id, Locale.forLanguageTag("uk"))).isSameAs(dto);
        assertThat(c.refreshPayment(id, Locale.forLanguageTag("uk"))).isSameAs(dto);

        verify(payments, times(1)).refreshOrder(order.getId());
        verify(lookup, times(2)).get(order.getId());

        Order second = new Order();
        second.setId(UuidUtil.randomBytes());
        second.setUserId(100L);
        when(orders.findById(second.getId())).thenReturn(Optional.of(second));
        when(lookup.get(second.getId())).thenReturn(second);
        c.refreshPayment(UuidUtil.toString(second.getId()), Locale.forLanguageTag("uk"));
        verify(payments).refreshOrder(second.getId());
    }

    @Test
    void refreshPayment_someoneElses_isForbidden_andBankNotAsked() {
        loginAs(5L);

        assertThatThrownBy(() -> controller().refreshPayment(id, Locale.ENGLISH))
                .isInstanceOf(DomainException.Forbidden.class);
        verify(payments, never()).refreshOrder(any());
    }
}
