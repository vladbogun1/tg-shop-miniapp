package com.maxsolch.shop.preorder;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.preorder.PreorderBatch.Distribution;
import com.maxsolch.shop.preorder.PreorderDtos.SubscribeRequest;
import com.maxsolch.shop.preorder.PreorderSubscription.Status;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.error.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PreorderQueueServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-27T10:00:00Z");
    private static final long USER = 42L;

    @Mock
    PreorderSubscriptionRepository subs;
    @Mock
    PreorderBatchRepository batches;
    @Mock
    PreorderBatchItemRepository items;
    @Mock
    ProductRepository products;
    @Mock
    SettingsService settings;
    @Mock
    ApplicationEventPublisher events;
    @Mock
    Messages messages;

    PreorderQueueService service;
    Product product;
    final AtomicLong ids = new AtomicLong(100);

    @BeforeEach
    void setUp() {
        service = new PreorderQueueService(subs, batches, items, products, settings, events, messages,
                Clock.fixed(NOW, ZoneOffset.UTC));
        product = new Product();
        product.setId(UuidUtil.toBytes(UUID.randomUUID()));
        product.setTitle("Lamzu Maya");
        product.setStock(0);
        when(products.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        when(products.findById(any())).thenReturn(Optional.of(product));
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(true);
        when(settings.getInt(SettingsRegistry.PREORDER_MAX_ACTIVE)).thenReturn(20);
        when(settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS)).thenReturn(24);
        when(settings.getInt(SettingsRegistry.ANTIBOT_MAX_QTY_PER_PRODUCT)).thenReturn(0);
        when(subs.save(any())).thenAnswer(inv -> {
            PreorderSubscription s = inv.getArgument(0);
            if (s.getId() == null) {
                s.setId(ids.incrementAndGet());
            }
            return s;
        });
        when(items.findPublicLines(any())).thenReturn(List.of());
        when(items.findPublicLines()).thenReturn(List.of());
    }

    private SubscribeRequest req(int qty) {
        return new SubscribeRequest(UuidUtil.toString(product.getId()), null, qty);
    }

    private PreorderSubscription seat(long id, long user, Status status, int qty, int held, int minutesAgo) {
        PreorderSubscription s = new PreorderSubscription();
        s.setId(id);
        s.setUserId(user);
        s.setProductId(product.getId());
        s.setQty(qty);
        s.setStatus(status.name());
        s.setHeldQty(held);
        s.setCreatedAt(NOW.minus(Duration.ofMinutes(minutesAgo)));
        return s;
    }

    // ---- subscribe

    @Test
    void subscribeJoinsTheQueueWhenOutOfStock() {
        var dto = service.subscribe(USER, PreorderQueueService.SOURCE_WEB, req(2));

        ArgumentCaptor<PreorderSubscription> saved = ArgumentCaptor.forClass(PreorderSubscription.class);
        verify(subs).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(USER);
        assertThat(saved.getValue().getQty()).isEqualTo(2);
        assertThat(saved.getValue().getStatus()).isEqualTo("WAITING");
        assertThat(saved.getValue().getSource()).isEqualTo("WEB");
        assertThat(saved.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(dto.status()).isEqualTo("WAITING");
        verify(events).publishEvent(any(PreorderEvents.Subscribed.class));
    }

    @Test
    void subscribeIsRefusedWhileSomethingIsFree() {
        product.setStock(1);

        assertThatThrownBy(() -> service.subscribe(USER, "MINIAPP", req(1)))
                .isInstanceOf(BadRequestException.class);
        verify(subs, never()).save(any());
    }

    @Test
    void subscribeIsAllowedWhenTheOnlyUnitIsHeldForSomebodyElse() {
        product.setStock(1);
        when(subs.queue(any(), isNull())).thenReturn(List.of(seat(1, 7, Status.HELD, 1, 1, 60)));

        service.subscribe(USER, "MINIAPP", req(1));

        verify(subs).save(any());
    }

    @Test
    void subscribeWithoutABatchNeedsTheAnyProductSetting() {
        when(settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT)).thenReturn(false);

        assertThatThrownBy(() -> service.subscribe(USER, "MINIAPP", req(1)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void subscribeAgainChangesTheQuantityInsteadOfADuplicate() {
        PreorderSubscription mine = seat(5, USER, Status.WAITING, 1, 0, 30);
        when(subs.findLive(eq(USER), any(), isNull())).thenReturn(List.of(mine));

        var dto = service.subscribe(USER, "MINIAPP", req(3));

        assertThat(mine.getQty()).isEqualTo(3);
        assertThat(dto.id()).isEqualTo(5);
        verify(events, never()).publishEvent(any(PreorderEvents.Subscribed.class));
    }

    @Test
    void subscribeChecksQuantityAndTheLimitOfQueues() {
        assertThatThrownBy(() -> service.subscribe(USER, "MINIAPP", req(11)))
                .isInstanceOf(BadRequestException.class);

        when(subs.countByUserIdAndStatusIn(eq(USER), any())).thenReturn(20L);
        assertThatThrownBy(() -> service.subscribe(USER, "MINIAPP", req(1)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void subscribeToAHiddenProductIsRefused() {
        product.setActive(false);

        assertThatThrownBy(() -> service.subscribe(USER, "MINIAPP", req(1)))
                .isInstanceOf(BadRequestException.class);
    }

    // ---- hand-out

    @Test
    void handOutHoldsUnitsForTheFirstPeopleAndTellsTheRest() {
        product.setStock(2);
        List<PreorderSubscription> queue = new ArrayList<>(List.of(
                seat(1, 11, Status.WAITING, 1, 0, 300),
                seat(2, 12, Status.WAITING, 1, 0, 200),
                seat(3, 13, Status.WAITING, 1, 0, 100)));
        when(subs.lockQueue(any(), isNull())).thenReturn(queue);

        var out = service.handOut(product, null, 9L, Distribution.QUEUE_HOLD, 24, true);

        assertThat(out.heldPeople()).isEqualTo(2);
        assertThat(out.shortPeople()).isEqualTo(1);
        assertThat(queue.get(0).getStatus()).isEqualTo("HELD");
        assertThat(queue.get(0).getHeldQty()).isEqualTo(1);
        assertThat(queue.get(0).getHoldUntil()).isEqualTo(NOW.plus(Duration.ofHours(24)));
        assertThat(queue.get(0).getBatchId()).isEqualTo(9L);
        assertThat(queue.get(2).getStatus()).isEqualTo("WAITING");
        verify(events).publishEvent(new PreorderEvents.StillWaiting(3, 1));
    }

    @Test
    void handOutAllAtOnceNotifiesEverybodyWithoutHolding() {
        product.setStock(1);
        List<PreorderSubscription> queue = new ArrayList<>(List.of(
                seat(1, 11, Status.WAITING, 1, 0, 300),
                seat(2, 12, Status.WAITING, 1, 0, 200)));
        when(subs.lockQueue(any(), isNull())).thenReturn(queue);

        var out = service.handOut(product, null, 9L, Distribution.ALL_AT_ONCE, 24, true);

        assertThat(out.notifiedPeople()).isEqualTo(2);
        assertThat(queue).allMatch(s -> s.getStatus().equals("NOTIFIED") && s.getHeldQty() == 0
                && s.getHoldUntil() != null);
    }

    @Test
    void handOutDoesNothingWhenEverythingIsAlreadyHeld() {
        product.setStock(1);
        List<PreorderSubscription> queue = new ArrayList<>(List.of(
                seat(1, 11, Status.HELD, 1, 1, 300),
                seat(2, 12, Status.WAITING, 1, 0, 200)));
        when(subs.lockQueue(any(), isNull())).thenReturn(queue);

        var out = service.handOut(product, null, null, Distribution.QUEUE_HOLD, 24, true);

        assertThat(out.heldPeople()).isZero();
        assertThat(queue.get(1).getStatus()).isEqualTo("WAITING");
    }

    // ---- leaving, buying, expiry

    @Test
    void leavingWithAHoldPassesTheUnitToTheNextPerson() {
        product.setStock(1);
        PreorderSubscription mine = seat(1, USER, Status.HELD, 1, 1, 300);
        mine.setHoldUntil(NOW.plus(Duration.ofHours(5)));
        PreorderSubscription next = seat(2, 12, Status.WAITING, 1, 0, 200);
        when(subs.findById(1L)).thenReturn(Optional.of(mine));
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(next)));

        service.unsubscribe(USER, 1);

        assertThat(mine.getStatus()).isEqualTo("CANCELLED");
        assertThat(mine.getHeldQty()).isZero();
        assertThat(next.getStatus()).isEqualTo("HELD");
    }

    @Test
    void someoneElsesPlaceCannotBeLeft() {
        when(subs.findById(1L)).thenReturn(Optional.of(seat(1, 99, Status.WAITING, 1, 0, 10)));

        assertThatThrownBy(() -> service.unsubscribe(USER, 1)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void buyingClosesThePlaceAndAnUnusedHoldGoesOn() {
        product.setStock(1);
        PreorderSubscription mine = seat(1, USER, Status.HELD, 2, 2, 300);
        PreorderSubscription next = seat(2, 12, Status.WAITING, 1, 0, 200);
        when(subs.lockLive(eq(USER), any(), isNull())).thenReturn(List.of(mine));
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(next)));
        byte[] orderId = UuidUtil.toBytes(UUID.randomUUID());

        service.onOrderPlaced(USER, orderId, List.<byte[][]>of(new byte[][]{product.getId(), null}));

        assertThat(mine.getStatus()).isEqualTo("BOUGHT");
        assertThat(mine.getOrderId()).isEqualTo(orderId);
        assertThat(next.getStatus()).isEqualTo("HELD");
    }

    @Test
    void anExpiredHoldGoesToTheNextPerson() {
        product.setStock(1);
        PreorderSubscription late = seat(1, 11, Status.HELD, 1, 1, 3000);
        late.setHoldUntil(NOW.minus(Duration.ofMinutes(1)));
        PreorderSubscription next = seat(2, 12, Status.WAITING, 1, 0, 200);
        when(subs.findExpiredHoldIds(eq(NOW), any())).thenReturn(List.<Object[]>of(new Object[]{1L, product.getId()}));
        when(subs.findForUpdate(1L)).thenReturn(Optional.of(late));
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(next)));

        assertThat(service.expireHolds()).isEqualTo(1);

        assertThat(late.getStatus()).isEqualTo("EXPIRED");
        assertThat(next.getStatus()).isEqualTo("HELD");
        verify(events).publishEvent(new PreorderEvents.HoldExpired(1L));
        verify(events).publishEvent(new PreorderEvents.HoldGranted(2L));
    }

    @Test
    void aHoldBoughtJustBeforeTheJobIsNotExpired() {
        product.setStock(1);
        PreorderSubscription bought = seat(1, 11, Status.BOUGHT, 1, 0, 3000);
        bought.setHoldUntil(NOW.minus(Duration.ofMinutes(1)));
        when(subs.findExpiredHoldIds(eq(NOW), any())).thenReturn(List.<Object[]>of(new Object[]{1L, product.getId()}));
        when(subs.findForUpdate(1L)).thenReturn(Optional.of(bought)); // the fresh row: the buyer won the race

        assertThat(service.expireHolds()).isZero();

        assertThat(bought.getStatus()).isEqualTo("BOUGHT");
        verify(events, never()).publishEvent(any(PreorderEvents.HoldExpired.class));
    }

    @Test
    void aHoldIsRemindedOnce() {
        PreorderSubscription s = seat(1, 11, Status.HELD, 1, 1, 3000);
        when(subs.findHoldsToRemind(eq(NOW), eq(NOW.plus(Duration.ofHours(3))), any())).thenReturn(List.of(s));

        assertThat(service.remindHolds()).isEqualTo(1);
        assertThat(s.getRemindedAt()).isEqualTo(NOW);
        verify(events).publishEvent(new PreorderEvents.HoldEnding(1L));
    }

    @Test
    void heldForOthersReadsTheRepository() {
        when(subs.lockQueue(any(), isNull())).thenReturn(List.of(
                seat(1, USER, Status.HELD, 1, 1, 60),
                seat(2, 12, Status.HELD, 2, 2, 50),
                seat(3, 13, Status.HELD, 1, 1, 40),
                seat(4, 14, Status.WAITING, 1, 0, 30)));

        assertThat(service.heldForOthers(product.getId(), null, USER)).isEqualTo(3);

    }

    // ---- stock coming back / leaving outside checkout

    @Test
    void unitsReturnedToTheShelfGoToTheQueue() {
        product.setStock(1);
        PreorderSubscription next = seat(2, 12, Status.WAITING, 1, 0, 200);
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(next)));

        service.onStockReturned(product, null);

        assertThat(next.getStatus()).isEqualTo("HELD");
        assertThat(next.getHoldUntil()).isEqualTo(NOW.plus(Duration.ofHours(24)));
        verify(events).publishEvent(new PreorderEvents.HoldGranted(2L));
    }

    @Test
    void unitsTakenFromTheShelfSendTheLatestHoldsBackToWaiting() {
        PreorderSubscription first = seat(1, 11, Status.HELD, 1, 1, 300);
        PreorderSubscription second = seat(2, 12, Status.HELD, 2, 2, 200);
        second.setHoldUntil(NOW.plus(Duration.ofHours(10)));
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(first, second)));

        service.onStockTaken(product, null, 1);

        assertThat(first.getStatus()).isEqualTo("HELD");
        assertThat(second.getStatus()).isEqualTo("WAITING");
        assertThat(second.getHeldQty()).isZero();
        assertThat(second.getHoldUntil()).isNull();
    }

    @Test
    void takingFewerUnitsShrinksTheLatestHold() {
        PreorderSubscription only = seat(1, 11, Status.HELD, 3, 3, 300);
        when(subs.lockQueue(any(), isNull())).thenReturn(new ArrayList<>(List.of(only)));

        service.onStockTaken(product, null, 2);

        assertThat(only.getStatus()).isEqualTo("HELD");
        assertThat(only.getHeldQty()).isEqualTo(2);
    }
}
