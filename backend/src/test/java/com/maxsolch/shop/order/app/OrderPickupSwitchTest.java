package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderEvents;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Nova Poshta ↔ pickup in the admin's delivery window: an order handed over in the shop but placed as a Nova Poshta
 * one (a dummy ТТН was typed to close it and «Внимание» showed «ТТН не найдена»).
 */
@ExtendWith(MockitoExtension.class)
class OrderPickupSwitchTest {

    @Mock
    OrderRepository orderRepository;
    @Mock
    DomainEvents events;
    @Mock
    EntityManager entityManager;

    final Map<String, OrderShipmentView.ShipmentBrief> parcels = new HashMap<>();
    OrderDeliveryEditing service;

    @BeforeEach
    void setUp() {
        OrderOps ops = new OrderOps(orderRepository, entityManager, mock(MoneyLedger.class),
                mock(OrderGifts.class), events, mock(com.maxsolch.shop.platform.i18n.Messages.class),
                Clock.systemUTC());
        service = new OrderDeliveryEditing(ops, orderRepository, events, new ParcelGuard(ids -> parcels));
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Order order(OrderStatus status, DeliveryMethod method) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        OrderFixtures.set(o, "customerName", "Петренко Іван");
        OrderFixtures.set(o, "phone", "+380501112233");
        OrderFixtures.set(o, "deliveryMethod", method);
        if (method == DeliveryMethod.NOVA_POSHTA) {
            OrderFixtures.set(o, "npCityRef", "city-1");
            OrderFixtures.set(o, "npCityName", "Харків");
            OrderFixtures.set(o, "npWarehouseRef", "wh-1");
            OrderFixtures.set(o, "npWarehouseName", "Поштомат №31225");
            OrderFixtures.set(o, "npServiceType", "POSTOMAT");
        }
        OrderFixtures.set(o, "items", new ArrayList<>());
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    private static OrderShipmentView.ShipmentBrief parcel(String origin, String stage, boolean handedOver) {
        return new OrderShipmentView.ShipmentBrief("20450000000000", origin, "Postomat", stage, null, null,
                null, null, null, null, null, 0, null, null, null, null, null, null, null, null, null, null, null,
                List.of(), handedOver);
    }

    private static OrderDeliveryEditing.DeliveryPatch toNp(String type, String whRef, String whName) {
        return new OrderDeliveryEditing.DeliveryPatch(null, null, "city-2", "Київ", whRef, whName,
                type, null, null, null, null, "Петренко", "Іван", null, "NOVA_POSHTA");
    }

    @Test
    void deliveredWithTypedTtn_becomesPickup_addressAndTtnCleared() {
        Order o = order(OrderStatus.DELIVERED, DeliveryMethod.NOVA_POSHTA);
        OrderFixtures.set(o, "trackingNumber", "20202020202020");
        parcels.put(UuidUtil.toString(o.getId()), parcel("MANUAL", "NOT_FOUND", false));

        OrderChange r = service.updateDelivery(o.getId(), OrderDeliveryEditing.DeliveryPatch.pickup());

        assertThat(r.order().getDeliveryMethod()).isEqualTo(DeliveryMethod.PICKUP);
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(r.order().getNpCityRef()).isNull();
        assertThat(r.order().getNpWarehouseName()).isNull();
        assertThat(r.order().getNpServiceType()).isNull();
        assertThat(r.order().getTrackingNumber()).isNull();
        assertThat(r.auditDetails()).contains("почтомат Поштомат №31225 → самовывоз").contains("ТТН 20202020202020 убрана");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publish(event.capture());
        assertThat(((OrderEvents.Edited) event.getValue()).kind()).isEqualTo(OrderEvents.EditKind.DETAILS);
    }

    @Test
    void approvedOrder_becomesPickup_withNameAndPhoneInOneGo() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.NOVA_POSHTA);

        OrderChange r = service.updateDelivery(o.getId(), new OrderDeliveryEditing.DeliveryPatch(null, "+380671234567",
                null, null, null, null, null, null, null, null, null, null, null, null, "pickup"));

        assertThat(r.order().getDeliveryMethod()).isEqualTo(DeliveryMethod.PICKUP);
        assertThat(r.order().getPhone()).isEqualTo("+380671234567");
    }

    @Test
    void shopMadeWaybill_mustBeCancelledFirst() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.NOVA_POSHTA);
        parcels.put(UuidUtil.toString(o.getId()), parcel("API", "CREATED", false));

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), OrderDeliveryEditing.DeliveryPatch.pickup()))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.PICKUP_HAS_WAYBILL);
        assertThat(o.getDeliveryMethod()).isEqualTo(DeliveryMethod.NOVA_POSHTA);
    }

    @Test
    void parcelAlreadyAtNp_staysNovaPoshta() {
        Order o = order(OrderStatus.SHIPPED, DeliveryMethod.NOVA_POSHTA);
        parcels.put(UuidUtil.toString(o.getId()), parcel("MANUAL", "IN_TRANSIT", true));

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), OrderDeliveryEditing.DeliveryPatch.pickup()))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.PARCEL_HANDED_OVER);
    }

    @Test
    void rejectedOrder_isNotSwitched() {
        Order o = order(OrderStatus.REJECTED, DeliveryMethod.NOVA_POSHTA);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), OrderDeliveryEditing.DeliveryPatch.pickup()))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.DELIVERY_EDIT_NOT_ALLOWED);
        verify(events, never()).publish(any());
    }

    @Test
    void alreadyPickup_isNoChange() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.PICKUP);

        OrderChange r = service.updateDelivery(o.getId(), OrderDeliveryEditing.DeliveryPatch.pickup());

        assertThat(r.auditDetails()).isEqualTo("без изменений");
    }

    @Test
    void openPickup_becomesNovaPoshta_withTheAddress() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.PICKUP);

        OrderChange r = service.updateDelivery(o.getId(), toNp("WAREHOUSE", "wh-7", "Відділення №7"));

        assertThat(r.order().getDeliveryMethod()).isEqualTo(DeliveryMethod.NOVA_POSHTA);
        assertThat(r.order().getNpCityName()).isEqualTo("Київ");
        assertThat(r.order().getNpWarehouseRef()).isEqualTo("wh-7");
        assertThat(r.order().getRecipientLastName()).isEqualTo("Петренко");
        assertThat(r.auditDetails()).contains("самовывоз → Київ, Відділення №7");
    }

    @Test
    void pickupToNovaPoshta_needsTheServiceType_andAnOpenOrder() {
        Order open = order(OrderStatus.NEW, DeliveryMethod.PICKUP);
        assertThatThrownBy(() -> service.updateDelivery(open.getId(), toNp(null, "wh-7", "Відділення №7")))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.NP_SERVICE_TYPE_UNKNOWN);

        Order shipped = order(OrderStatus.SHIPPED, DeliveryMethod.PICKUP);
        assertThatThrownBy(() -> service.updateDelivery(shipped.getId(), toNp("WAREHOUSE", "wh-7", "Відділення №7")))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.NP_SWITCH_AFTER_SHIPPING);

        Order delivered = order(OrderStatus.DELIVERED, DeliveryMethod.PICKUP);
        assertThatThrownBy(() -> service.updateDelivery(delivered.getId(), toNp("WAREHOUSE", "wh-7", "Відділення №7")))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.NP_SWITCH_AFTER_SHIPPING);
    }

    @Test
    void lowerCaseMethod_isTheSameSwitch() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.PICKUP);
        OrderDeliveryEditing.DeliveryPatch p = toNp("WAREHOUSE", "wh-7", "Відділення №7");
        OrderChange r = service.updateDelivery(o.getId(), new OrderDeliveryEditing.DeliveryPatch(null, null,
                p.npCityRef(), p.npCityName(), p.npWarehouseRef(), p.npWarehouseName(), p.npServiceType(),
                null, null, null, null, p.recipientLastName(), p.recipientFirstName(), null, " nova_poshta "));
        assertThat(r.order().getDeliveryMethod()).isEqualTo(DeliveryMethod.NOVA_POSHTA);
    }

    @Test
    void unknownMethod_isRejected() {
        Order o = order(OrderStatus.APPROVED, DeliveryMethod.NOVA_POSHTA);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), new OrderDeliveryEditing.DeliveryPatch(null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, "COURIER")))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("errorCode").isEqualTo(OrderError.DELIVERY_METHOD_UNKNOWN);
    }
}
