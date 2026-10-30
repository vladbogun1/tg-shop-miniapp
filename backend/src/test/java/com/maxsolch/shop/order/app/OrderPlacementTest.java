package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.customer.app.Customers;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The checkout button: retries, guard, username snapshot, source and the journal line. */
class OrderPlacementTest {

    private final Checkout checkout = mock(Checkout.class);
    private final OrderLookup lookup = mock(OrderLookup.class);
    private final Customers users = mock(Customers.class);
    private final OrderIdempotencyService idempotency = mock(OrderIdempotencyService.class);
    private final OrderGuard guard = mock(OrderGuard.class);
    private final ActivityLog activity = mock(ActivityLog.class);
    private final OrderPlacement placement = new OrderPlacement(checkout, lookup, users, idempotency, guard, activity);

    {
        org.mockito.Mockito.when(activity.fromRequest(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(i -> ActivityLog.Entry.of(ActivityLog.MINIAPP, i.getArgument(0)));
    }

    private static CreateOrderCommand draft() {
        return new CreateOrderCommand(7L, 7L, null, List.of(new CreateOrderCommand.Line("p", null, 1)),
                "Имя", "+380", null, null, "PICKUP", null, null, null, null, "opt", null, null);
    }

    private static Order created() {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderFixtures.set(o, "items", new ArrayList<>());
        OrderFixtures.set(o, "currency", "UAH");
        return o;
    }

    @Test
    void newOrder_snapshotsUsername_marksSource_remembersKey_andJournals() {
        User u = new User();
        u.setUsername("vasya");
        when(users.findById(7L)).thenReturn(Optional.of(u));
        Order order = created();
        when(checkout.createOrder(any())).thenReturn(order);

        OrderPlacement.Placed placed = placement.place(7L, true, "k", draft());

        ArgumentCaptor<CreateOrderCommand> cmd = ArgumentCaptor.forClass(CreateOrderCommand.class);
        verify(checkout).createOrder(cmd.capture());
        assertThat(cmd.getValue().tgUsername()).isEqualTo("vasya");
        assertThat(cmd.getValue().source()).isEqualTo(OrderSource.WEB);
        assertThat(placed.orderId()).isEqualTo(UuidUtil.toString(order.getId()));
        verify(idempotency).remember(7L, "k", placed.orderId());
        verify(activity).record(any(ActivityLog.Entry.class));
    }

    @Test
    void retriedKey_returnsTheEarlierOrder_withoutCreatingAnother() {
        Order earlier = created();
        String earlierId = UuidUtil.toString(earlier.getId());
        when(idempotency.previousOrderId(7L, "k")).thenReturn(earlierId);
        when(lookup.get(earlier.getId())).thenReturn(earlier);

        assertThat(placement.place(7L, false, "k", draft()).orderId()).isEqualTo(earlierId);

        verify(checkout, never()).createOrder(any());
    }

    @Test
    void refusedByTheGuard_isJournaled_andRethrown() {
        doThrow(new DomainException.BadRequest("слишком часто")).when(guard).check(any(Long.class), any());

        assertThatThrownBy(() -> placement.place(7L, false, null, draft()))
                .isInstanceOf(DomainException.BadRequest.class);

        verify(checkout, never()).createOrder(any());
        verify(activity).record(any(ActivityLog.Entry.class));
        verify(idempotency, never()).remember(any(Long.class), any(), any());
    }
}
