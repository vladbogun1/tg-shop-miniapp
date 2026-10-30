package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderDeliveryEditingTest {

    @Mock
    OrderRepository orderRepository;
    @Mock
    ApplicationEventPublisher events;
    @Mock
    EntityManager entityManager;

    OrderDeliveryEditing service;

    @BeforeEach
    void setUp() {
        OrderOps ops = new OrderOps(orderRepository, entityManager, mock(MoneyLedger.class),
                mock(OrderGifts.class), events, mock(com.maxsolch.shop.platform.i18n.Messages.class),
                Clock.systemUTC());
        service = new OrderDeliveryEditing(ops, orderRepository, events);
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        o.setCustomerName("Іван Петренко");
        o.setPhone("+380501112233");
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityRef("city-1");
        o.setNpCityName("Київ");
        o.setNpWarehouseRef("wh-1");
        o.setNpWarehouseName("Відділення №1");
        o.setItems(new ArrayList<>());
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    // ---------- tracking ----------

    @Test
    void updateTracking_shippedOrder_replacesNumberAndNotifiesCustomer() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTrackingNumber("20450000000000");

        OrderChange r = service.updateTracking(o.getId(), " 2045 0000 0000 01 ");

        assertThat(r.order().getTrackingNumber()).isEqualTo("20450000000001");
        assertThat(r.auditDetails()).contains("20450000000000").contains("20450000000001");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        OrderEvents.Edited edited = (OrderEvents.Edited) event.getValue();
        assertThat(edited.kind()).isEqualTo(OrderEvents.EditKind.TRACKING);
        assertThat(edited.notifyCustomer()).isTrue();
    }

    @Test
    void updateTracking_beforeShipping_isRejected() {
        Order o = order(OrderStatus.APPROVED);

        assertThatThrownBy(() -> service.updateTracking(o.getId(), "20450000000001"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessage("ТТН можно изменить только у отправленного или доставленного заказа");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void updateTracking_sameEmptyOrTooLong_isNotAChange() {
        Order o = order(OrderStatus.DELIVERED);
        o.setTrackingNumber("20450000000000");

        assertThat(service.updateTracking(o.getId(), "2045 0000 0000 00").auditDetails()).isEqualTo("ТТН не изменилась");
        assertThatThrownBy(() -> service.updateTracking(o.getId(), "  "))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("укажите номер ТТН");
        assertThatThrownBy(() -> service.updateTracking(o.getId(), "1".repeat(129)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("номер ТТН слишком длинный");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void updateTracking_unknownOrder_isNotFound() {
        byte[] id = UuidUtil.randomBytes();
        when(orderRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateTracking(id, "1"))
                .isInstanceOf(DomainException.NotFound.class);
    }

    // ---------- delivery ----------

    @Test
    void updateDelivery_changesOnlyGivenFields_andDescribesThem() {
        Order o = order(OrderStatus.APPROVED);

        OrderChange r = service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch(null, "+380671234567",
                        "city-2", "Львів", "wh-9", "Відділення №9"));

        assertThat(r.order().getCustomerName()).isEqualTo("Іван Петренко");
        assertThat(r.order().getPhone()).isEqualTo("+380671234567");
        assertThat(r.order().getNpWarehouseRef()).isEqualTo("wh-9");
        assertThat(r.order().getNpCityName()).isEqualTo("Львів");
        assertThat(r.auditDetails()).contains("телефон").contains("Львів");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        assertThat(((OrderEvents.Edited) event.getValue()).kind()).isEqualTo(OrderEvents.EditKind.DETAILS);
    }

    @Test
    void updateDelivery_nothingChanged_isNoChange() {
        Order o = order(OrderStatus.NEW);

        OrderChange r = service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch("Іван Петренко", "+380501112233", "city-1", "Київ", "wh-1", "Відділення №1"));

        assertThat(r.auditDetails()).isEqualTo("без изменений");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void updateDelivery_badNamePhoneOrPickup_isRejected() {
        Order o = order(OrderStatus.NEW);
        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch(" ", null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("ФИО не может быть пустым");
        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch(null, "12345", null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("проверьте номер телефона");
        o.setDeliveryMethod(DeliveryMethod.PICKUP);
        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch(null, null, "c", "Львів", "w", "№9")))
                .isInstanceOf(DomainException.BadRequest.class).hasMessage("у заказа самовывоз — отделение не указывается");
    }

    @Test
    void updateDelivery_halfAnAddress_isRejected() {
        Order o = order(OrderStatus.NEW);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch(null, null, "city-2", "Львів", null, null)))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void updateDelivery_deliveredOrder_isRejected() {
        Order o = order(OrderStatus.DELIVERED);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderDeliveryEditing.DeliveryPatch("Нове Ім'я", null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class);
    }
}
