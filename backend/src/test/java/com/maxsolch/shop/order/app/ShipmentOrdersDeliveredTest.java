package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Channel;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Kind;
import com.maxsolch.shop.order.domain.OrderMoneyMovement.Source;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderProperties;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Nova Poshta reports the parcel picked up, with what «Контроль оплати» collected for us (deliverByCarrier). */
class ShipmentOrdersDeliveredTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private final MoneyLedger ledger = mock(MoneyLedger.class);
    private ShipmentOrders shipments;

    @BeforeEach
    void setUp() {
        OrderOps ops = new OrderOps(orders, mock(EntityManager.class), ledger, mock(OrderGifts.class),
                mock(DomainEvents.class), mock(Messages.class), Clock.systemUTC());
        OrderLifecycle lifecycle = new OrderLifecycle(ops, orders, mock(OrderStock.class), mock(DomainEvents.class),
                new OrderProperties(), OrderApp.defaultSettings());
        shipments = new ShipmentOrders(orders, lifecycle, ops, mock(DomainEvents.class));
        when(orders.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    /** SHIPPED, 1500 ₴, {@code receivedMinor} already paid (prepayment). */
    private Order shipped(long receivedMinor) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.SHIPPED);
        OrderFixtures.set(o, "deliveryMethod", DeliveryMethod.NOVA_POSHTA);
        OrderFixtures.set(o, "totalMinor", 150_000L);
        OrderFixtures.set(o, "receivedMinor", receivedMinor);
        OrderFixtures.set(o, "items", new ArrayList<>());
        when(orders.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void collectedByPaymentControl_isJournaledAsSuch_nothingLeftForCod() {
        Order o = shipped(20_000);

        assertThat(shipments.markDelivered(o.getId(), 130_000)).isTrue();

        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(o.getReceivedMinor()).isEqualTo(150_000);
        assertThat(o.isPaid()).isTrue();
        verify(ledger).record(eq(o.getId()), eq(Kind.PAYMENT), eq(Channel.NP_PAYMENT_CONTROL), eq(130_000L),
                eq(Source.AUTO), isNull(), any(), isNull());
        verify(ledger, never()).record(any(), any(), eq(Channel.NP_COD), anyLong(), any(), any(), any(), any());
    }

    @Test
    void repeatedReport_doesNotDoubleTheMoney() {
        Order o = shipped(20_000);
        shipments.markDelivered(o.getId(), 130_000);

        assertThat(shipments.markDelivered(o.getId(), 130_000)).isFalse();

        assertThat(o.getReceivedMinor()).isEqualTo(150_000);
        verify(ledger, times(1)).record(any(), any(), any(), anyLong(), any(), any(), any(), any());
    }

    @Test
    void collectedMoreThanTheTotal_isCappedAtTheTotal() {
        Order o = shipped(20_000);

        shipments.markDelivered(o.getId(), 999_999);

        assertThat(o.getReceivedMinor()).isEqualTo(150_000);
        verify(ledger).record(any(), eq(Kind.PAYMENT), eq(Channel.NP_PAYMENT_CONTROL), eq(130_000L), any(), any(),
                any(), any());
    }

    @Test
    void withoutASum_theRestIsCodAsBefore() {
        Order o = shipped(20_000);

        assertThat(shipments.markDelivered(o.getId())).isTrue();

        assertThat(o.getReceivedMinor()).isEqualTo(150_000);
        verify(ledger).record(any(), eq(Kind.PAYMENT), eq(Channel.NP_COD), eq(130_000L), any(), any(), any(), any());
        verify(ledger, never()).record(any(), any(), eq(Channel.NP_PAYMENT_CONTROL), anyLong(), any(), any(), any(),
                any());
    }

    @Test
    void notShipped_isLeftAlone() {
        Order o = shipped(0);
        OrderStates.withStatus(o, OrderStatus.APPROVED);

        assertThat(shipments.markDelivered(o.getId(), 150_000)).isFalse();

        assertThat(o.getReceivedMinor()).isZero();
        verify(ledger, never()).record(any(), any(), any(), anyLong(), any(), any(), any(), any());
    }
}
