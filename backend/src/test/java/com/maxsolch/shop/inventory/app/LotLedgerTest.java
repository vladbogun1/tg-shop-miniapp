package com.maxsolch.shop.inventory.app;

import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.inventory.infra.StockLotRepository;
import com.maxsolch.shop.order.domain.OrderItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/** FIFO lots: sales leave the oldest lot, returns go back where they came from, hand edits follow stock. */
class LotLedgerTest {

    static final byte[] PAD = {1};
    final List<StockLot> store = new ArrayList<>();
    final AtomicLong ids = new AtomicLong();
    LotLedger ledger;

    @BeforeEach
    void setUp() {
        StockLotRepository repo = Mockito.mock(StockLotRepository.class);
        when(repo.findKey(any(), any())).thenAnswer(inv -> store.stream()
                .filter(l -> Arrays.equals(l.getProductId(), (byte[]) inv.getArgument(0))
                        && Arrays.equals(l.getVariantId(), (byte[]) inv.getArgument(1)))
                .sorted(Comparator.comparing(StockLot::getId)).toList());
        when(repo.findById(anyLong())).thenAnswer(inv -> store.stream()
                .filter(l -> l.getId().equals(inv.getArgument(0))).findFirst());
        when(repo.save(any())).thenAnswer(inv -> {
            StockLot l = inv.getArgument(0);
            if (l.getId() == null) {
                l.setId(ids.incrementAndGet());
                store.add(l);
            }
            return l;
        });
        ledger = new LotLedger(repo, java.time.Clock.systemUTC());
    }

    private StockLot lot(int qty, String kind) {
        StockLot l = new StockLot();
        l.setId(ids.incrementAndGet());
        l.setProductId(PAD);
        l.setKind(kind);
        l.setQtyIn(qty);
        l.setQtyLeft(qty);
        store.add(l);
        return l;
    }

    @Test
    void salesLeaveTheOldLotFirstThenTheNewOne() {
        StockLot old = lot(4, "OPENING");
        StockLot fresh = lot(10, "BATCH");
        OrderItem first = new OrderItem();
        OrderItem second = new OrderItem();

        ledger.take(PAD, null, 3, first);
        ledger.take(PAD, null, 3, second);

        assertThat(old.getQtyLeft()).isZero();
        assertThat(fresh.getQtyLeft()).isEqualTo(8);
        assertThat(first.getLots()).singleElement().satisfies(a -> {
            assertThat(a.getLotId()).isEqualTo(old.getId());
            assertThat(a.getQty()).isEqualTo(3);
        });
        assertThat(second.getLots()).extracting(a -> a.getLotId() + "x" + a.getQty())
                .containsExactly(old.getId() + "x1", fresh.getId() + "x2");
    }

    @Test
    void aReturnGoesBackToItsLotNewestAllocationFirst() {
        StockLot old = lot(1, "OPENING");
        StockLot fresh = lot(5, "BATCH");
        OrderItem item = new OrderItem();
        ledger.take(PAD, null, 3, item);

        ledger.give(PAD, null, 2, item);

        assertThat(fresh.getQtyLeft()).isEqualTo(5);
        assertThat(old.getQtyLeft()).isZero();
        assertThat(item.getLots()).singleElement().satisfies(a -> assertThat(a.getLotId()).isEqualTo(old.getId()));
    }

    @Test
    void aPartialReturnKeepsTheRestOfTheAllocationAndASecondReturnFinishesIt() {
        StockLot old = lot(1, "OPENING");
        StockLot fresh = lot(5, "BATCH");
        OrderItem item = new OrderItem();
        ledger.take(PAD, null, 4, item); // 1 from old, 3 from fresh

        ledger.give(PAD, null, 1, item); // newest allocation first: back to fresh
        assertThat(fresh.getQtyLeft()).isEqualTo(3);
        assertThat(old.getQtyLeft()).isZero();
        assertThat(item.getLots()).extracting(a -> a.getQty()).containsExactlyInAnyOrder(1, 2);

        ledger.give(PAD, null, 3, item);
        assertThat(fresh.getQtyLeft()).isEqualTo(5);
        assertThat(old.getQtyLeft()).isEqualTo(1);
        assertThat(item.getLots()).isEmpty();
        assertThat(store.stream().mapToInt(StockLot::getQtyLeft).sum()).isEqualTo(6);
    }

    @Test
    void unitsTheLotsCannotCoverAreSoldWithoutCostAndComeBackToTheOpeningLot() {
        lot(1, "BATCH");
        OrderItem item = new OrderItem();
        ledger.take(PAD, null, 3, item); // stock drifted before the ledger: only 1 unit on lots

        assertThat(item.getLots()).singleElement().satisfies(a -> assertThat(a.getQty()).isEqualTo(1));

        ledger.give(PAD, null, 3, item);
        StockLot opening = store.stream().filter(l -> "OPENING".equals(l.getKind())).findFirst().orElseThrow();
        assertThat(opening.getQtyLeft()).isEqualTo(2);
        assertThat(item.getLots()).isEmpty();
    }

    @Test
    void handEditsFollowTheStock() {
        StockLot old = lot(4, "OPENING");
        lot(2, "BATCH");

        ledger.sync(PAD, null, 9);
        assertThat(store).filteredOn(l -> "MANUAL".equals(l.getKind())).singleElement()
                .satisfies(l -> assertThat(l.getQtyLeft()).isEqualTo(3));

        ledger.sync(PAD, null, 2);
        assertThat(old.getQtyLeft()).isZero();
        assertThat(store.stream().mapToInt(StockLot::getQtyLeft).sum()).isEqualTo(2);
    }

    @Test
    void anArrivalIsABatchLot() {
        StockLot l = ledger.receive(PAD, null, 77L, 6);
        assertThat(l.batch()).isTrue();
        assertThat(l.getBatchItemId()).isEqualTo(77L);
        assertThat(l.getQtyLeft()).isEqualTo(6);
        assertThat(l.getId()).isNotNull();
    }

    @Test
    void reattach_movesUnitsToTheBatchLinesLot_shelfTotalStays() {
        StockLot manual = lot(5, "MANUAL");
        StockLot batch = lot(2, "BATCH");
        batch.setBatchItemId(77L);

        ledger.reattach(manual, 3, 77L);

        assertThat(manual.getQtyLeft()).isEqualTo(2);
        assertThat(manual.getQtyIn()).isEqualTo(2);
        assertThat(batch.getQtyLeft()).isEqualTo(5);
        assertThat(batch.getQtyIn()).isEqualTo(5);
        assertThat(store.stream().mapToInt(StockLot::getQtyLeft).sum()).isEqualTo(7);
    }

    @Test
    void reattach_toALineWithoutALot_makesOne() {
        StockLot manual = lot(4, "MANUAL");

        StockLot made = ledger.reattach(manual, 4, 9L);

        assertThat(made.getKind()).isEqualTo("BATCH");
        assertThat(made.getBatchItemId()).isEqualTo(9L);
        assertThat(made.getQtyLeft()).isEqualTo(4);
        assertThat(manual.getQtyLeft()).isZero();
    }

    @Test
    void split_keepsKindAndKey_andRefusesMoreThanOnTheShelf() {
        StockLot old = lot(6, "OPENING");
        old.setQtyIn(9);                                   // 3 sold before

        StockLot part = ledger.split(old, 2);

        assertThat(part.getKind()).isEqualTo("OPENING");
        assertThat(part.getQtyIn()).isEqualTo(2);
        assertThat(old.getQtyLeft()).isEqualTo(4);
        assertThat(old.getQtyIn()).isEqualTo(7);           // the 3 sold stay on it
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> ledger.split(old, 5))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
