package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** One «Потрібна доплата» per top-up, after the edits are over. */
class TopUpNoticeJobsTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCustomerNotifier customer = mock(OrderCustomerNotifier.class);
    private final TopUpNoticeJobs notices;

    TopUpNoticeJobsTest() {
        PlatformTransactionManager tm = mock(PlatformTransactionManager.class);
        TransactionStatus status = new SimpleTransactionStatus();
        when(tm.getTransaction(any())).thenReturn(status);
        notices = new TopUpNoticeJobs(orders, customer,
                Clock.fixed(Instant.parse("2026-11-04T08:40:00Z"), ZoneOffset.UTC), tm);
    }

    private Order grown(String notice) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.APPROVED);
        OrderItem it = new OrderItem();
        OrderFixtures.set(it, "priceMinorSnapshot", 800_00L);
        OrderFixtures.set(it, "quantity", 2);
        OrderFixtures.set(o, "items", new ArrayList<>(List.of(it)));
        OrderFixtures.set(o, "totalMinor", 1600_00L);
        OrderFixtures.set(o, "receivedMinor", 1450_00L);
        OrderFixtures.set(o, "paid", true);
        OrderFixtures.set(o, "paymentDueAt", Instant.parse("2026-11-05T07:43:41Z"));
        OrderFixtures.set(o, "topupNotice", notice);
        when(orders.findById(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void newTopUp_isRememberedFirst_thenSent() {
        Order o = grown(null);

        notices.notifyOne(o.getId());

        var order = inOrder(orders, customer);
        order.verify(orders).updateTopUpNotice(o.getId(), "15000:ONLINE");
        order.verify(customer).notifyCustomerTopUp(o, 150_00);
    }

    @Test
    void theSameTopUp_isNotSentAgain() {
        Order o = grown("15000:ONLINE");

        notices.notifyOne(o.getId());

        verify(customer, never()).notifyCustomerTopUp(any(), anyLong());
        verify(orders, never()).updateTopUpNotice(any(), any());
    }

    @Test
    void anotherWay_isSent_soTheCustomerHearsAboutCod() {
        Order o = grown("15000:ONLINE");
        o.collectBalanceOnDelivery(true);

        notices.notifyOne(o.getId());

        verify(orders).updateTopUpNotice(o.getId(), "15000:COD");
        verify(customer).notifyCustomerTopUp(o, 150_00);
    }
}
