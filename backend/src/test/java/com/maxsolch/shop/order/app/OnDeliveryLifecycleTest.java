package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.RejectReasonCode;
import com.maxsolch.shop.order.infra.OrderProperties;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The approve guard («Не одобрять неоплаченные») and the auto-cancel of a never approved «при отриманні» order. */
class OnDeliveryLifecycleTest {

    private final OrderRepository orders = mock(OrderRepository.class);
    private SettingsService settings;
    private OrderLifecycle lifecycle;

    @BeforeEach
    void setUp() {
        settings = OrderApp.defaultSettings();
        OrderOps ops = new OrderOps(orders, mock(EntityManager.class), mock(MoneyLedger.class), mock(OrderGifts.class),
                mock(DomainEvents.class), mock(Messages.class), Clock.systemUTC());
        lifecycle = new OrderLifecycle(ops, orders, mock(OrderStock.class), mock(DomainEvents.class),
                new OrderProperties(), settings);
        when(orders.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Order newOrder(long totalMinor) {
        Order o = new Order();
        OrderFixtures.set(o, "id", UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.NEW);
        OrderFixtures.set(o, "deliveryMethod", DeliveryMethod.NOVA_POSHTA);
        OrderFixtures.set(o, "totalMinor", totalMinor);
        OrderFixtures.set(o, "items", new ArrayList<>());
        when(orders.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    @Test
    void unpaidOnlineOrder_waitsForTheMoney() {
        Order o = newOrder(100_000);
        o.choosePayment(new byte[16], "Онлайн", 0, Instant.now().plus(Duration.ofHours(24)));

        assertThatThrownBy(() -> lifecycle.approve(o.getId()))
                .isInstanceOfSatisfying(DomainException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(OrderError.APPROVE_ONLINE_PAYMENT_MISSING));
        assertThat(lifecycle.approveBlockedUnpaid(o)).isTrue();
        assertThat(o.getStatus()).isEqualTo(OrderStatus.NEW);
    }

    @Test
    void unpaidPrepayment_hasItsOwnWording_andTheSettingLetsItThrough() {
        Order o = newOrder(100_000);
        o.choosePayment(new byte[16], "Передоплата", 20_000, Instant.now().plus(Duration.ofHours(24)));

        assertThatThrownBy(() -> lifecycle.approve(o.getId()))
                .isInstanceOfSatisfying(DomainException.class,
                        e -> assertThat(e.errorCode()).isEqualTo(OrderError.APPROVE_PREPAYMENT_MISSING));

        when(settings.get(CheckoutSettings.FORBID_APPROVE_UNPAID, true)).thenReturn(false);
        assertThat(lifecycle.approve(o.getId()).getStatus()).isEqualTo(OrderStatus.APPROVED);
    }

    @Test
    void payOnDelivery_isApprovedAtOnce() {
        Order o = newOrder(100_000);
        o.choosePaymentOnDelivery(new byte[16], "При отриманні");

        assertThat(lifecycle.approve(o.getId()).getStatus()).isEqualTo(OrderStatus.APPROVED);
    }

    @Test
    void neverApprovedPayOnDelivery_isCancelledAfterTheHold() {
        Order o = newOrder(100_000);
        o.choosePaymentOnDelivery(new byte[16], "При отриманні");
        Instant now = Instant.parse("2026-11-12T12:00:00Z");
        OrderFixtures.set(o, "createdAt", now.minus(Duration.ofHours(47)));

        assertThat(lifecycle.expireOnDeliveryHold(o.getId(), now)).isNull();

        OrderFixtures.set(o, "createdAt", now.minus(Duration.ofHours(49)));
        Order rejected = lifecycle.expireOnDeliveryHold(o.getId(), now);

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getRejectReason()).isEqualTo("Не одобрен в течение 48 ч");
        assertThat(rejected.getRejectReasonCode()).isEqualTo(RejectReasonCode.NO_RESPONSE.name());
    }

    @Test
    void holdSwitchedOff_orOnlineOrder_isLeftAlone() {
        Instant now = Instant.parse("2026-11-12T12:00:00Z");
        Order online = newOrder(100_000);
        online.choosePayment(new byte[16], "Онлайн", 0, now.plus(Duration.ofHours(1)));
        OrderFixtures.set(online, "createdAt", now.minus(Duration.ofDays(5)));
        assertThat(lifecycle.expireOnDeliveryHold(online.getId(), now)).isNull();

        Order cod = newOrder(100_000);
        cod.choosePaymentOnDelivery(new byte[16], "При отриманні");
        OrderFixtures.set(cod, "createdAt", now.minus(Duration.ofDays(5)));
        when(settings.get(CheckoutSettings.ON_DELIVERY_HOLD_HOURS, 48)).thenReturn(0);
        assertThat(lifecycle.expireOnDeliveryHold(cod.getId(), now)).isNull();
    }
}
