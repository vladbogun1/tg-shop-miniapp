package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.OrderChange;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.LineOutcome;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Посылка вернулась»: units of a returned parcel go to the shelf or to the write-offs. */
class ReturnReceivingTest extends ReturnsTestBase {

    @Test
    void receiveReturn_onlyForAParcelOnItsWayBack() {
        Order o = order(OrderStatus.REJECTED);

        assertThatThrownBy(() -> receiving.receive(o.getId(), List.of(), null, "owner"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void receiveReturn_brokenUnits_areWrittenOff_andTheParcelIsMarkedReceived() {
        Order o = order(OrderStatus.REJECTED);
        OrderFixtures.set(o, "returnStatus", Order.RETURN_IN_TRANSIT);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 1);

        OrderChange r = receiving.receive(o.getId(),
                List.of(new ReturnReceiving.ReceivedLine(1L, 1, LineOutcome.DEFECT)),
                null, "owner");

        assertThat(r.order().getReturnStatus()).isEqualTo(Order.RETURN_RECEIVED);
        assertThat(r.order().getReturnReceivedAt()).isNotNull();
        assertThat(it.getReturnedQty()).isEqualTo(1);
        verify(writeoffs).save(any());
    }

    @Test
    void receiveReturn_partialReturnOfADeliveredOrder_takesOnlyTheTravellingUnits() {
        Order o = order(OrderStatus.DELIVERED);
        OrderFixtures.set(o, "returnStatus", Order.RETURN_IN_TRANSIT);
        Product mouse = product(0);
        OrderItem back = item(o, mouse, 1L, 3);
        OrderFixtures.set(back, "returnedQty", 2);
        OrderFixtures.set(back, "returnPendingQty", 2);
        OrderItem stays = item(o, product(0), 2L, 1);
        when(productRepository.findByIdForUpdate(mouse.getId())).thenReturn(Optional.of(mouse));

        OrderChange r = receiving.receive(o.getId(),
                List.of(new ReturnReceiving.ReceivedLine(1L, 1, LineOutcome.DEFECT)),
                null, "owner");

        assertThat(r.order().getReturnStatus()).isEqualTo(Order.RETURN_RECEIVED);
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(mouse.getStock()).isEqualTo(1);
        assertThat(back.getRestockedQty()).isEqualTo(1);
        assertThat(back.getReturnedQty()).isEqualTo(2);
        assertThat(back.getReturnPendingQty()).isZero();
        assertThat(stays.getRestockedQty()).isZero();
        verify(writeoffs).save(any());
    }

}
