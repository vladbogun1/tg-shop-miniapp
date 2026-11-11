package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.DeliveryTarget;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.settings.app.SettingsService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Checkout v2 (V98): the split recipient, the Nova Poshta address kinds and «оплата при отриманні». */
class CheckoutDeliveryTest {

    private static final byte[] OPTION_ID = new byte[16];

    private final OrderRepository orders = mock(OrderRepository.class);
    private final DeliveryAddressCheck addressCheck = mock(DeliveryAddressCheck.class);
    private SettingsService settings;
    private CheckoutDelivery delivery;

    @BeforeEach
    void setUp() {
        settings = OrderApp.defaultSettings();
        OrderOps ops = new OrderOps(orders, mock(EntityManager.class), mock(MoneyLedger.class), mock(OrderGifts.class),
                mock(DomainEvents.class), mock(Messages.class), Clock.systemUTC());
        delivery = new CheckoutDelivery(addressCheck, settings, orders, ops);
        when(addressCheck.check(any())).thenAnswer(inv -> {
            DeliveryAddressCheck.Address a = inv.getArgument(0);
            return new DeliveryAddressCheck.Resolved(a.serviceType(), null);
        });
    }

    private static CreateOrderCommand cmd(String customerName, String cityRef, String whRef,
                                          CreateOrderCommand.NpDetails np) {
        return new CreateOrderCommand(1L, 1L, null, List.of(), customerName, "+380501112233", null, null,
                "NOVA_POSHTA", cityRef, "Харків", whRef, "Відділення №1", null, null, null, np);
    }

    private static CreateOrderCommand.NpDetails np(String type, String street, String building, String last,
                                                   String first) {
        return new CreateOrderCommand.NpDetails(type, null, street, building, "5", last, first, null);
    }

    private static OrderPaymentOptions.Option onDelivery(String deliveries) {
        return new OrderPaymentOptions.Option(OPTION_ID, "При отриманні", false, 0,
                OrderPaymentOptions.KIND_ON_DELIVERY, deliveries);
    }

    private static Order orderTo(DeliveryTarget target) {
        Order o = new Order();
        o.deliverTo(target);
        return o;
    }

    private static DeliveryTarget branch() {
        return new DeliveryTarget(DeliveryMethod.NOVA_POSHTA, "city-1", "Харків", "wh-1", "Відділення №1",
                NpServiceType.WAREHOUSE, null, null, null, null);
    }

    private static void assertCode(Runnable r, OrderError error) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(error));
    }

    // ---------- recipient ----------

    @Test
    void splitName_becomesTheOneLineSurnameFirst() {
        CheckoutDelivery.Recipient r = delivery.recipient(cmd(null, "city-1", "wh-1", np(null, null, null, "Петренко", "Іван")));

        assertThat(r.customerName()).isEqualTo("Петренко Іван");
        assertThat(r.parts().lastName()).isEqualTo("Петренко");
        assertThat(r.parts().firstName()).isEqualTo("Іван");
    }

    @Test
    void oldClient_oneNameField_noParts() {
        CheckoutDelivery.Recipient r = delivery.recipient(cmd(" Іван Петренко ", "city-1", "wh-1", null));

        assertThat(r.customerName()).isEqualTo("Іван Петренко");
        assertThat(r.parts()).isNull();
    }

    @Test
    void surnameWithoutName_isRefused() {
        assertCode(() -> delivery.recipient(cmd(null, "city-1", "wh-1", np(null, null, null, "Петренко", " "))),
                OrderError.RECIPIENT_REQUIRED);
    }

    // ---------- address ----------

    @Test
    void courier_needsStreetAndHouse_andDropsTheBranch() {
        assertCode(() -> delivery.target(cmd(null, "city-1", null, np("DOORS", "вул. Сумська", " ", null, null)),
                DeliveryMethod.NOVA_POSHTA), OrderError.NP_ADDRESS_REQUIRED);

        DeliveryTarget t = delivery.target(cmd(null, "city-1", "wh-1", np("DOORS", "вул. Сумська", "10", null, null)),
                DeliveryMethod.NOVA_POSHTA);
        assertThat(t.serviceType()).isEqualTo(NpServiceType.DOORS);
        assertThat(t.npStreetName()).isEqualTo("вул. Сумська");
        assertThat(t.npBuilding()).isEqualTo("10");
        assertThat(t.npFlat()).isEqualTo("5");
        assertThat(t.npWarehouseRef()).isNull();
    }

    @Test
    void branch_kindAndNameComeFromTheDirectory() {
        doReturn(
                new DeliveryAddressCheck.Resolved(NpServiceType.POSTOMAT, "Поштомат №7 (з довідника)")).when(addressCheck).check(any());

        DeliveryTarget t = delivery.target(cmd(null, "city-1", "wh-1", null), DeliveryMethod.NOVA_POSHTA);

        assertThat(t.serviceType()).isEqualTo(NpServiceType.POSTOMAT);
        assertThat(t.npWarehouseName()).isEqualTo("Поштомат №7 (з довідника)");
    }

    @Test
    void cityAndBranchAreRequired_unknownTypeIsRefused() {
        assertCode(() -> delivery.target(cmd(null, " ", "wh-1", null), DeliveryMethod.NOVA_POSHTA),
                OrderError.NP_CITY_REQUIRED);
        assertCode(() -> delivery.target(cmd(null, "city-1", null, null), DeliveryMethod.NOVA_POSHTA),
                OrderError.NP_WAREHOUSE_REQUIRED);
        assertCode(() -> delivery.target(cmd(null, "city-1", "wh-1", np("PIGEON", null, null, null, null)),
                DeliveryMethod.NOVA_POSHTA), OrderError.NP_WAREHOUSE_REQUIRED);
    }

    @Test
    void pickup_hasNoAddress() {
        DeliveryTarget t = delivery.target(cmd(null, "city-1", "wh-1", null), DeliveryMethod.PICKUP);

        assertThat(t.npCityRef()).isNull();
        assertThat(t.npWarehouseRef()).isNull();
        assertThat(t.serviceType()).isNull();
    }

    // ---------- payment ----------

    @Test
    void onDelivery_switchedOff_isUnknown() {
        Order o = orderTo(branch());
        assertCode(() -> delivery.choosePayment(o, onDelivery(null), Instant.now()), OrderError.PAYMENT_METHOD_UNKNOWN);
    }

    @Test
    void onDelivery_switchedOn_nothingToPayOnline_noDeadline() {
        when(settings.get(CheckoutSettings.ON_DELIVERY_ENABLED, false)).thenReturn(true);
        Order o = orderTo(branch());
        OrderFixtures.set(o, "totalMinor", 150_000L);

        delivery.choosePayment(o, onDelivery(null), Instant.now());

        assertThat(o.isPaymentOnDelivery()).isTrue();
        assertThat(o.getPaymentDueAt()).isNull();
        assertThat(o.getPrepaymentMinor()).isZero();
        assertThat(OrderMoney.amountDueMinor(o)).isZero();
        assertThat(OrderMoney.codMinor(o)).isEqualTo(150_000L);
    }

    @Test
    void optionLimitedToOtherDeliveries_orOnDeliveryForPickup_isRefused() {
        when(settings.get(CheckoutSettings.ON_DELIVERY_ENABLED, false)).thenReturn(true);
        assertCode(() -> delivery.choosePayment(orderTo(branch()), onDelivery("DOORS"), Instant.now()),
                OrderError.PAYMENT_NOT_FOR_DELIVERY);
        Order pickup = orderTo(new DeliveryTarget(DeliveryMethod.PICKUP, null, null, null, null));
        assertCode(() -> delivery.choosePayment(pickup, onDelivery(null), Instant.now()),
                OrderError.PAYMENT_NOT_FOR_DELIVERY);
    }

    @Test
    void onlineOption_startsThePaymentClock() {
        Order o = orderTo(branch());
        Instant due = Instant.parse("2026-11-13T10:00:00Z");

        delivery.choosePayment(o, new OrderPaymentOptions.Option(OPTION_ID, "Передоплата", true, 20_000), due);

        assertThat(o.isPaymentOnDelivery()).isFalse();
        assertThat(o.getPaymentDueAt()).isEqualTo(due);
        assertThat(o.getPrepaymentMinor()).isEqualTo(20_000);
    }

    @Test
    void onDelivery_sumCeilingAndOneOpenOrderPerBuyer() {
        when(settings.get(CheckoutSettings.ON_DELIVERY_ENABLED, false)).thenReturn(true);
        Order o = orderTo(branch());
        delivery.choosePayment(o, onDelivery(null), Instant.now());

        OrderFixtures.set(o, "totalMinor", 500_001L);
        assertCode(() -> delivery.checkOnDeliveryLimits(o, 1L), OrderError.ON_DELIVERY_LIMIT);

        OrderFixtures.set(o, "totalMinor", 100_000L);
        when(orders.countOpenOnDelivery(anyLong())).thenReturn(1L);
        assertCode(() -> delivery.checkOnDeliveryLimits(o, 1L), OrderError.ON_DELIVERY_OPEN_LIMIT);

        when(orders.countOpenOnDelivery(anyLong())).thenReturn(0L);
        delivery.checkOnDeliveryLimits(o, 1L);
    }
}
