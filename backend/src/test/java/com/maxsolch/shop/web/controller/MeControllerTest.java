package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.payment.CustomerPaymentRefresh;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.service.CustomerProfileService;
import com.maxsolch.shop.order.app.MessageService;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderService;
import com.maxsolch.shop.platform.error.ForbiddenException;
import com.maxsolch.shop.platform.error.NotFoundException;
import com.maxsolch.shop.web.dto.MeProfileDto;
import com.maxsolch.shop.order.api.OrderDetailDto;
import com.maxsolch.shop.order.api.OrderSummaryDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Characterisation of what MeController does around the customer's own orders: who may see an
 * order, the 5-second brake on monobank polling, the locale switch and the profile. Wiring is in
 * {@link #controller()} only.
 */
@ExtendWith(MockitoExtension.class)
class MeControllerTest {

    @Mock
    UserRepository users;
    @Mock
    AdminUserRepository admins;
    @Mock
    OrderRepository orders;
    @Mock
    OrderQueryService queries;
    @Mock
    MessageService chat;
    @Mock
    OrderService orderService;
    @Mock
    Messages messages;
    @Mock
    OnlinePaymentService payments;
    @Mock
    ActivityLog activity;

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

    MeController controller() {
        MeController c = new MeController(new CustomerProfileService(users, admins),
                new CustomerOrders(orders, messages), queries, chat, orderService, null, null, null,
                null, messages, payments, new CustomerPaymentRefresh(payments));
        ReflectionTestUtils.setField(c, "activity", activity);
        return c;
    }

    private static void loginAs(long telegramUserId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(telegramUserId, Role.CUSTOMER), null, List.of()));
    }

    // ------------------------------------------------------------------ order ownership

    @Test
    void ownedOrder_archived_isNotFound() {
        order.setArchivedAt(Instant.now());

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(NotFoundException.class).hasMessage("api.order.notFound");
        verifyNoInteractions(chat);
    }

    @Test
    void ownedOrder_unknown_isNotFound() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(NotFoundException.class).hasMessage("api.order.notFound");
    }

    @Test
    void ownedOrder_garbageId_isNotFound() {
        assertThatThrownBy(() -> controller().markRead("zzz"))
                .isInstanceOf(NotFoundException.class).hasMessage("api.order.notFound");
        verifyNoInteractions(orders);
    }

    @Test
    void ownedOrder_someoneElses_isForbidden() {
        loginAs(5L);

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(ForbiddenException.class).hasMessage("api.order.notYours");
        verifyNoInteractions(chat);
    }

    @Test
    void ownedOrder_owner_canMarkRead() {
        var response = controller().markRead(id);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(chat).markRead(order.getId(), SenderType.ADMIN);
    }

    @Test
    void myOrders_hidesArchived_andMapsTheRest() {
        Order archived = new Order();
        archived.setArchivedAt(Instant.now());
        when(orders.findByUserIdOrderByCreatedAtDesc(100L)).thenReturn(List.of(archived, order));
        List<OrderSummaryDto> summaries = List.of(mock(OrderSummaryDto.class));
        when(queries.toSummaries(List.of(order))).thenReturn(summaries);

        assertThat(controller().myOrders()).isSameAs(summaries);
    }

    // ------------------------------------------------------------------ payment refresh brake

    @Test
    void refreshPayment_asksBankOnce_perFiveSeconds_perOrder_butAlwaysReturnsFreshOrder() {
        OrderDetailDto dto = mock(OrderDetailDto.class);
        when(orderService.get(order.getId())).thenReturn(order);
        when(queries.toDetail(order, "uk")).thenReturn(dto);
        MeController c = controller();

        assertThat(c.refreshPayment(id, Locale.forLanguageTag("uk"))).isSameAs(dto);
        assertThat(c.refreshPayment(id, Locale.forLanguageTag("uk"))).isSameAs(dto);

        verify(payments, times(1)).refreshOrder(order.getId());
        verify(orderService, times(2)).get(order.getId());

        Order second = new Order();
        second.setId(UuidUtil.randomBytes());
        second.setUserId(100L);
        when(orders.findById(second.getId())).thenReturn(Optional.of(second));
        when(orderService.get(second.getId())).thenReturn(second);
        c.refreshPayment(UuidUtil.toString(second.getId()), Locale.forLanguageTag("uk"));
        verify(payments).refreshOrder(second.getId());
    }

    @Test
    void refreshPayment_someoneElses_isForbidden_andBankNotAsked() {
        loginAs(5L);

        assertThatThrownBy(() -> controller().refreshPayment(id, Locale.ENGLISH))
                .isInstanceOf(ForbiddenException.class);
        verify(payments, never()).refreshOrder(any());
    }

    // ------------------------------------------------------------------ locale

    @Test
    void setLocale_unsupported_isIgnored() {
        var response = controller().setLocale("xx");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verifyNoInteractions(users, activity);
    }

    @Test
    void setLocale_changed_isSaved_andJournaled() {
        User user = new User();
        user.setLocale("ru");
        when(users.findById(100L)).thenReturn(Optional.of(user));

        var response = controller().setLocale("UK-ua");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(user.getLocale()).isEqualTo("uk");
        verify(users).save(user);
        verify(activity, times(1)).record(any(ActivityLog.Entry.class));
    }

    @Test
    void setLocale_same_isStillSaved_butNotJournaled() {
        User user = new User();
        user.setLocale("en");
        when(users.findById(100L)).thenReturn(Optional.of(user));

        controller().setLocale("en");

        verify(users).save(user);
        verifyNoInteractions(activity);
    }

    @Test
    void setLocale_unknownUser_doesNothing() {
        when(users.findById(100L)).thenReturn(Optional.empty());

        assertThat(controller().setLocale("en").getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(users, never()).save(any());
        verifyNoInteractions(activity);
    }

    // ------------------------------------------------------------------ profile

    @Test
    void me_knownUser_withAdminFlag() {
        User user = new User();
        user.setTelegramUserId(100L);
        user.setUsername("nick");
        user.setFirstName("A");
        user.setLastName("B");
        when(users.findById(100L)).thenReturn(Optional.of(user));
        when(admins.existsByTelegramUserIdAndActiveTrue(100L)).thenReturn(true);

        assertThat(controller().me()).isEqualTo(new MeProfileDto(100L, "nick", "A", "B", true));
    }

    @Test
    void me_unknownUser_fallsBackToBareProfile() {
        when(users.findById(100L)).thenReturn(Optional.empty());

        assertThat(controller().me()).isEqualTo(new MeProfileDto(100L, null, null, null, false));
    }
}
