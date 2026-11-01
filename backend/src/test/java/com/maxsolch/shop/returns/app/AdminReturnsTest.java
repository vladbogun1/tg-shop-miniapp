package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderOnlinePayments;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The wizard's money step: the bank is asked once, and a failed write after it is not lost silently. */
class AdminReturnsTest {

    private final AdminOrderQueries queries = mock(AdminOrderQueries.class);
    private final Returns returns = mock(Returns.class);
    private final OrderOnlinePayments payments = mock(OrderOnlinePayments.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private final OrderLookup orders = mock(OrderLookup.class);
    private final DbLocks locks = new DbLocks(new InMemoryLockProvider(), Clock.systemUTC());
    private final AdminReturns admin = new AdminReturns(queries, orders, returns, mock(ReturnReceiving.class),
            mock(Exchanges.class), mock(ReturnCancellation.class), payments, audit, mock(DefectWriteoffs.class), locks);

    private final Order order = new Order();
    private final ReturnPlan plan = new ReturnPlan(List.of(), List.of(), 0, 500_00, null, false);

    AdminReturnsTest() {
        OrderFixtures.set(order, "id", UuidUtil.randomBytes());
        when(queries.load("o1")).thenReturn(order);
        when(payments.refundableInvoice(any(), anyLong())).thenReturn("inv-1");
    }

    @Test
    void failedWriteIsRepeatedAndTheCardRefundIsSentOnce() {
        OrderChange change = mock(OrderChange.class);
        when(returns.registerPlan(any(), any(), any(), anyBoolean()))
                .thenThrow(new IllegalStateException("deadlock"))
                .thenReturn(change);

        admin.registerPlan("o1", plan);

        verify(payments, times(1)).refundHeld(any(), any(), anyLong());
        verify(returns, times(2)).registerPlan(any(), any(), any(), anyBoolean());
    }

    @Test
    void whenTheWriteKeepsFailingTheAdminIsToldTheMoneyIsGoneAndTheLockIsFree() {
        when(returns.registerPlan(any(), any(), any(), anyBoolean())).thenThrow(new IllegalStateException("db down"));

        assertThatThrownBy(() -> admin.registerPlan("o1", plan))
                .isInstanceOf(DomainException.BadRequest.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode().name()).isEqualTo("MONO_REFUND_SENT_NOT_BOOKED"));

        verify(payments, times(1)).refundHeld(any(), any(), anyLong());
        verify(audit).record(eq("ORDER_REFUND_ONLINE_UNBOOKED"), any(), any(), any());
        assertThat(locks.tryLock(OrderOnlinePayments.RETURN_LOCK + UuidUtil.toString(order.getId()),
                OrderOnlinePayments.RETURN_LOCK_TTL)).isPresent();
    }

    @Test
    void secondWizardWhileOneRunsIsRefusedBeforeAnyMoneyMoves() {
        var held = locks.tryLock(OrderOnlinePayments.RETURN_LOCK + UuidUtil.toString(order.getId()),
                OrderOnlinePayments.RETURN_LOCK_TTL).orElseThrow();
        try {
            assertThatThrownBy(() -> admin.registerPlan("o1", plan)).isInstanceOf(DomainException.BadRequest.class);
        } finally {
            held.release();
        }
        verify(payments, never()).refundHeld(any(), any(), anyLong());
    }
}
