package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.DbLocks;
import com.maxsolch.shop.platform.jobs.InMemoryLockProvider;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static com.maxsolch.shop.delivery.app.NpFixtures.ORDER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** «Створити ТТН» twice at once for one order (two backends during a release): NP is asked once. */
class ShipmentLockTest {

    private final InMemoryLockProvider table = new InMemoryLockProvider();
    private final ShipmentPreparation preparation = mock(ShipmentPreparation.class);
    private final NpWaybillWriter writer = mock(NpWaybillWriter.class);
    private final ShipmentStore store = mock(ShipmentStore.class);
    private final ShipmentOrders orders = mock(ShipmentOrders.class);
    private ShipmentCreation creation;

    @BeforeEach
    void setUp() {
        creation = NpFixtures.creation(preparation, writer, store, NpFixtures.locks(table), orders,
                mock(SettingsService.class));
        when(orders.find(ORDER)).thenReturn(Optional.of(NpFixtures.order(OrderStatus.APPROVED, false, null)));
        when(store.persistSafely(eq(ORDER), any(), any(), any())).thenReturn(NpFixtures.api(ShipmentStage.CREATED));
    }

    private static DeliveryError code(Throwable t) {
        return (DeliveryError) ((DomainException) t).errorCode();
    }

    @Test
    void secondCreateWhileTheFirstWaitsForNpIsBusyAndNpIsCalledOnce() {
        when(preparation.prepare(eq(ORDER), any())).thenReturn(NpFixtures.prepared(null));
        AtomicReference<Throwable> second = new AtomicReference<>();
        when(writer.saveOnce(any())).thenAnswer(inv -> {
            try {
                creation.create(ORDER, Options.defaults());
            } catch (RuntimeException e) {
                second.set(e);
            }
            return NpFixtures.result();
        });

        OrderShipment made = creation.create(ORDER, Options.defaults());

        assertThat(made.getTtn()).isEqualTo(NpFixtures.TTN);
        assertThat(code(second.get())).isEqualTo(DeliveryError.NP_TTN_BUSY);
        verify(writer, times(1)).saveOnce(any());
        verify(store, times(1)).persistSafely(eq(ORDER), any(), any(), any());
    }

    @Test
    void theActiveWaybillIsReadAgainInsideTheLock() {
        // The first request saved its waybill while the second one waited: the re-read inside the lock sees it.
        when(preparation.prepare(eq(ORDER), any())).thenAnswer(inv -> {
            assertThat(new DbLocks(table, Clock.systemUTC()).tryLock(ShipmentLocks.name(ORDER), Duration.ofSeconds(5)))
                    .as("prepare() runs under the order's lock").isEmpty();
            return NpFixtures.prepared(NpFixtures.api(ShipmentStage.CREATED));
        });

        assertThatThrownBy(() -> creation.create(ORDER, Options.defaults()))
                .satisfies(e -> assertThat(code(e)).isEqualTo(DeliveryError.NP_TTN_EXISTS));
        verify(writer, never()).saveOnce(any());
        verify(store, never()).persistSafely(any(), any(), any(), any());
    }

    @Test
    void theLockIsFreeAgainAfterAFailedCreate() {
        when(preparation.prepare(eq(ORDER), any())).thenReturn(NpFixtures.prepared(null));
        when(writer.saveOnce(any())).thenThrow(new IllegalStateException("NP down")).thenReturn(NpFixtures.result());

        assertThatThrownBy(() -> creation.create(ORDER, Options.defaults())).hasMessageContaining("NP down");
        assertThat(creation.create(ORDER, Options.defaults()).getTtn()).isEqualTo(NpFixtures.TTN);
        verify(writer, times(2)).saveOnce(any());
    }
}
