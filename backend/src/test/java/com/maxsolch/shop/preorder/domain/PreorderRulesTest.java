package com.maxsolch.shop.preorder.domain;

import com.maxsolch.shop.preorder.domain.PreorderRules.Allocation;
import com.maxsolch.shop.preorder.domain.PreorderRules.Seat;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PreorderRulesTest {

    @Test
    void allocateGivesUnitsInQueueOrderAndPartialToTheLastOne() {
        List<Seat> queue = List.of(
                new Seat(1, Status.WAITING, 2, 0),
                new Seat(2, Status.WAITING, 2, 0),
                new Seat(3, Status.WAITING, 1, 0));

        Allocation a = PreorderRules.allocate(queue, 3);

        assertThat(a.grants()).containsExactly(new PreorderRules.Grant(1, 2), new PreorderRules.Grant(2, 1));
        assertThat(a.shorts()).containsExactly(new PreorderRules.Short(3, 1));
        assertThat(a.grantedQty()).isEqualTo(3);
        assertThat(a.freeLeft()).isZero();
    }

    @Test
    void allocateSkipsPeopleAlreadyServedAndLeavesTheRestFree() {
        List<Seat> queue = List.of(
                new Seat(1, Status.HELD, 1, 1),
                new Seat(2, Status.NOTIFIED, 1, 0),
                new Seat(3, Status.WAITING, 1, 0));

        Allocation a = PreorderRules.allocate(queue, 5);

        assertThat(a.grants()).containsExactly(new PreorderRules.Grant(3, 1));
        assertThat(a.shorts()).isEmpty();
        assertThat(a.freeLeft()).isEqualTo(4);
    }

    @Test
    void allocateWithNothingFreeMakesEverybodyShortInOrder() {
        Allocation a = PreorderRules.allocate(List.of(
                new Seat(7, Status.WAITING, 1, 0), new Seat(8, Status.WAITING, 3, 0)), 0);

        assertThat(a.grants()).isEmpty();
        assertThat(a.shorts()).extracting(PreorderRules.Short::position).containsExactly(1, 2);
    }

    @Test
    void freeIsStockMinusHolds() {
        List<Seat> queue = List.of(
                new Seat(1, Status.HELD, 2, 2),
                new Seat(2, Status.WAITING, 1, 0),
                new Seat(3, Status.NOTIFIED, 1, 0));

        assertThat(PreorderRules.free(5, queue)).isEqualTo(3);
        assertThat(PreorderRules.free(1, queue)).isZero();
    }
}
