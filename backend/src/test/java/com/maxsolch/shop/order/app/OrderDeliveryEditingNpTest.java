package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
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

/** Checkout v2 corrections of the admin (V98): service type, courier address, split recipient, handed-over parcel. */
@ExtendWith(MockitoExtension.class)
class OrderDeliveryEditingNpTest {

    @Mock
    OrderRepository orderRepository;
    @Mock
    DomainEvents events;
    @Mock
    EntityManager entityManager;

    /** order id → the parcel the delivery module reports for it. */
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

    private Order order(OrderStatus status) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        OrderFixtures.set(o, "customerName", "Петренко Іван");
        OrderFixtures.set(o, "phone", "+380501112233");
        OrderFixtures.set(o, "deliveryMethod", DeliveryMethod.NOVA_POSHTA);
        OrderFixtures.set(o, "npCityRef", "city-1");
        OrderFixtures.set(o, "npCityName", "Харків");
        OrderFixtures.set(o, "npWarehouseRef", "wh-1");
        OrderFixtures.set(o, "npWarehouseName", "Відділення №1");
        OrderFixtures.set(o, "items", new ArrayList<>());
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    private static OrderDeliveryEditing.DeliveryPatch patch(String type, String street, String building, String flat,
                                                            String last, String first) {
        return new OrderDeliveryEditing.DeliveryPatch(null, null, null, null, null, null,
                type, null, street, building, flat, last, first, null);
    }

    private static OrderShipmentView.ShipmentBrief parcel(String ttn, boolean handedOver) {
        return new OrderShipmentView.ShipmentBrief(ttn, "API", "WarehouseWarehouse", "IN_TRANSIT", "5", "В дорозі",
                null, null, null, null, null, 0, null, null, null, null, null, null, null, null, null, null, null,
                List.of(), handedOver);
    }

    @Test
    void toCourier_replacesBranchWithAddress_keepsCity_namesRecipient() {
        Order o = order(OrderStatus.APPROVED);

        OrderChange r = service.updateDelivery(o.getId(), patch("DOORS", "вул. Сумська", "10", "5", "Петренко", "Іван"));

        assertThat(r.order().getNpServiceType()).isEqualTo("DOORS");
        assertThat(r.order().getNpCityRef()).isEqualTo("city-1");
        assertThat(r.order().getNpWarehouseRef()).isNull();
        assertThat(r.order().getNpStreetName()).isEqualTo("вул. Сумська");
        assertThat(r.order().getNpBuilding()).isEqualTo("10");
        assertThat(r.order().getNpFlat()).isEqualTo("5");
        assertThat(r.order().getRecipientLastName()).isEqualTo("Петренко");
        assertThat(r.order().getRecipientFirstName()).isEqualTo("Іван");
        assertThat(r.auditDetails()).contains("курьер").contains("получатель");
    }

    @Test
    void postomatWithoutLocker_courierWithoutBuilding_unknownType_areRejected() {
        Order o = order(OrderStatus.NEW);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), patch("POSTOMAT", null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.updateDelivery(o.getId(), patch("DOORS", "вул. Сумська", " ", null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.updateDelivery(o.getId(), patch("PIGEON", null, null, null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(o.getNpServiceType()).isNull();
        verify(events, never()).publish(any());
    }

    @Test
    void recipientNeedsSurnameAndName() {
        Order o = order(OrderStatus.NEW);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), patch(null, null, null, null, "Петренко", null)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThat(o.getRecipientLastName()).isNull();
    }

    @Test
    void handedOverParcel_blocksAddressAndRecipient_butNotThePhone() {
        Order o = order(OrderStatus.APPROVED);
        parcels.put(UuidUtil.toString(o.getId()), parcel("20451234567890", true));

        assertThatThrownBy(() -> service.updateDelivery(o.getId(), patch("DOORS", "вул. Сумська", "10", null, null, null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("20451234567890");
        OrderChange phone = service.updateDelivery(o.getId(), new OrderDeliveryEditing.DeliveryPatch(
                null, "+380509998877", null, null, null, null));
        assertThat(phone.order().getPhone()).isEqualTo("+380509998877");
    }

    @Test
    void parcelNotYetHandedOver_allowsTheChange() {
        Order o = order(OrderStatus.APPROVED);
        parcels.put(UuidUtil.toString(o.getId()), parcel("20451234567890", false));

        OrderChange r = service.updateDelivery(o.getId(), new OrderDeliveryEditing.DeliveryPatch(null, null,
                null, null, "pm-7", "Поштомат №7", "POSTOMAT", null, null, null, null, null, null, null));
        assertThat(r.order().getNpServiceType()).isEqualTo("POSTOMAT");
        assertThat(r.order().getNpWarehouseRef()).isEqualTo("pm-7");
        assertThat(r.auditDetails()).contains("почтомат");
    }
}
