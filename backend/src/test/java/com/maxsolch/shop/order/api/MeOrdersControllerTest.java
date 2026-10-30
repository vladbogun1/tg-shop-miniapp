package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.MessageService;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderSummaryDto;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.journal.ActivityLog;
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
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Who may see an order of the customer's own list, and what the list hides. Wiring is in {@link #controller()} only. */
@ExtendWith(MockitoExtension.class)
class MeOrdersControllerTest {

    @Mock
    OrderRepository orders;
    @Mock
    OrderQueryService queries;
    @Mock
    MessageService chat;
    @Mock
    Messages messages;
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

    MeOrdersController controller() {
        return new MeOrdersController(new CustomerOrders(orders, messages), queries, chat, null, null, null,
                messages, activity, new CurrentActor());
    }

    private static void loginAs(long telegramUserId) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(telegramUserId, Role.CUSTOMER), null, List.of()));
    }

    @Test
    void ownedOrder_archived_isNotFound() {
        order.setArchivedAt(Instant.now());

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(DomainException.NotFound.class).hasMessage("api.order.notFound");
        verifyNoInteractions(chat);
    }

    @Test
    void ownedOrder_unknown_isNotFound() {
        when(orders.findById(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(DomainException.NotFound.class).hasMessage("api.order.notFound");
    }

    @Test
    void ownedOrder_garbageId_isNotFound() {
        assertThatThrownBy(() -> controller().markRead("zzz"))
                .isInstanceOf(DomainException.NotFound.class).hasMessage("api.order.notFound");
        verifyNoInteractions(orders);
    }

    @Test
    void ownedOrder_someoneElses_isForbidden() {
        loginAs(5L);

        assertThatThrownBy(() -> controller().markRead(id))
                .isInstanceOf(DomainException.Forbidden.class).hasMessage("api.order.notYours");
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
}
