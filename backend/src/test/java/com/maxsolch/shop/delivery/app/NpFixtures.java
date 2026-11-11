package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.Prepared.NpResult;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.settings.app.SettingsService;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;

/** Orders, waybills and the lock for the unit tests of the waybill scenarios (one place to change the shapes). */
final class NpFixtures {

    static final byte[] ORDER = new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16};
    static final String TTN = "20450000000001";

    private NpFixtures() {
    }

    /** The real {@link ShipmentLocks} over an in-memory lock table. */
    static ShipmentLocks locks(InMemoryLockProvider table) {
        return new ShipmentLocks(new DbLocks(table, Clock.systemUTC()));
    }

    /** «Створити ТТН» with these parts; prices, parcels and alerts are not reached without a city. */
    static ShipmentCreation creation(ShipmentPreparation preparation, NpWaybillWriter writer, ShipmentStore store,
                                     ShipmentLocks locks, ShipmentOrders orders, SettingsService settings) {
        return creation(preparation, writer, store, locks, orders, settings, null);
    }

    static ShipmentCreation creation(ShipmentPreparation preparation, NpWaybillWriter writer, ShipmentStore store,
                                     ShipmentLocks locks, ShipmentOrders orders, SettingsService settings,
                                     ShipmentCancellation cancellation) {
        return new ShipmentCreation(preparation, writer, store, locks, null, null, orders, settings, null,
                cancellation);
    }

    static ShipmentCancellation cancellation(OrderShipmentRepository shipments, NpWaybillWriter writer,
                                             ShipmentStore store, ShipmentLocks locks) {
        return new ShipmentCancellation(shipments, writer, store, locks);
    }

    static OrderShipment shipment(String origin, ShipmentStage stage, String ttn) {
        OrderShipment s = new OrderShipment();
        s.setId(new byte[] {9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9});
        s.setOrderId(ORDER);
        s.setOrigin(origin);
        s.setStage(stage.name());
        s.setTtn(ttn);
        s.setNpRef("np-ref-1");
        s.setActive(true);
        return s;
    }

    static OrderShipment api(ShipmentStage stage) {
        return shipment(OrderShipment.ORIGIN_API, stage, TTN);
    }

    /** An NP order to a branch, nothing owed. */
    static ShippingOrder order(OrderStatus status, boolean archived, String trackingNumber) {
        return order(status, archived, trackingNumber, DeliveryMethod.NOVA_POSHTA);
    }

    static ShippingOrder order(OrderStatus status, boolean archived, String trackingNumber, DeliveryMethod method) {
        return new ShippingOrder(ORDER, "01020304", status, method, NpServiceType.WAREHOUSE, "city", "Харків",
                "wh-1", "Відділення №1", null, null, null, null, "Петренко Іван", null, null, null,
                "+380991090362", false, 1000_00, 0, true, 0, false, archived, trackingNumber, null, null, List.of(), "");
    }

    /** An NP order with money owed: {@code codMinor} on pickup, {@code dueMinor} online, missing or not. */
    static ShippingOrder owing(boolean paid, long codMinor, long dueMinor, boolean onlineMissing) {
        return new ShippingOrder(ORDER, "01020304", OrderStatus.APPROVED, DeliveryMethod.NOVA_POSHTA,
                NpServiceType.WAREHOUSE, "city", "Харків", "wh-1", "Відділення №1", null, null, null, null,
                "Петренко Іван", null, null, null, "+380991090362", false, 1000_00, codMinor, paid, dueMinor,
                onlineMissing, false, null, null, null, List.of(), "");
    }

    /** Runs the callback at once, without a database. */
    static final class DirectTx extends org.springframework.transaction.support.TransactionTemplate {
        @Override
        public <T> T execute(org.springframework.transaction.support.TransactionCallback<T> action) {
            return action.doInTransaction(new org.springframework.transaction.support.SimpleTransactionStatus());
        }
    }

    /** What {@link ShipmentPreparation#prepare} gives for a ready NEW order; {@code active} = its waybill now. */
    static Prepared prepared(OrderShipment active) {
        return new Prepared("01020304-0506-0708-090a-0b0c0d0e0f10", "01020304", OrderStatus.APPROVED.name(),
                NpServiceType.WAREHOUSE, null, "Харків", "wh-1", "Відділення №1", null, null, null, null,
                "380991090362", "Петренко", "Іван", null, new Parcel(1000, 200, 150, 100, "t"), 1000_00, 0, false,
                "Товари", LocalDate.of(2026, 11, 12), null, null, List.of(), List.of(), false, 0, active, "", "");
    }

    static NpResult result() {
        return new NpResult("np-ref-1", TTN, null, null);
    }

    /** Runs the listener's background work on the calling thread. */
    static final class DirectExecutor extends AbstractExecutorService {
        @Override
        public void execute(Runnable command) {
            command.run();
        }

        @Override
        public void shutdown() {
        }

        @Override
        public List<Runnable> shutdownNow() {
            return List.of();
        }

        @Override
        public boolean isShutdown() {
            return false;
        }

        @Override
        public boolean isTerminated() {
            return false;
        }

        @Override
        public boolean awaitTermination(long timeout, TimeUnit unit) {
            return true;
        }
    }

    static Instant now() {
        return Instant.parse("2026-11-12T08:00:00Z");
    }
}
