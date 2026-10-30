package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import com.maxsolch.shop.platform.tx.DomainEvents;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** What the queue does when procurement tells it a batch was cancelled, and how it counts the waiting. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QueueBatchPortTest {

    private static final Instant NOW = Instant.parse("2026-10-27T10:00:00Z");

    @Mock PreorderSubscriptionRepository subs;
    @Mock PreorderQueueService queue;
    @Mock DomainEvents events;

    QueueBatchPort port;
    byte[] productId;

    @BeforeEach
    void setUp() {
        port = new QueueBatchPort(queue, subs, events, Clock.fixed(NOW, ZoneOffset.UTC));
        productId = UuidUtil.toBytes(UUID.randomUUID());
    }

    private PreorderSubscription seat(long id, Status status) {
        PreorderSubscription s = new PreorderSubscription();
        s.setId(id);
        s.setUserId(100 + id);
        s.setProductId(productId);
        s.setStatus(status.name());
        s.setQty(1);
        s.setCreatedAt(NOW);
        return s;
    }

    private List<PreorderSubscription> queueOfLine() {
        List<PreorderSubscription> q = new ArrayList<>(List.of(seat(1, Status.WAITING), seat(2, Status.HELD),
                seat(3, Status.WAITING)));
        when(subs.queue(any(), any())).thenReturn(q);
        return q;
    }

    @Test
    void aCancelledBatchKeepsTheWaitersAndTellsThem() {
        List<PreorderSubscription> q = queueOfLine();

        port.onBatchCancelled(List.<byte[][]>of(new byte[][]{productId, null}), false, NOW);

        assertThat(q).extracting(PreorderSubscription::getStatus).containsExactly("WAITING", "HELD", "WAITING");
        verify(events).publish(new PreorderEvents.BatchCancelledKept(1));
        verify(events).publish(new PreorderEvents.BatchCancelledKept(3));
        verify(events, never()).publish(new PreorderEvents.BatchCancelledKept(2));
    }

    @Test
    void closingTheQueueTakesTheWaitersOffButNotTheHeld() {
        List<PreorderSubscription> q = queueOfLine();

        port.onBatchCancelled(List.<byte[][]>of(new byte[][]{productId, null}), true, NOW);

        assertThat(q).extracting(PreorderSubscription::getStatus).containsExactly("CANCELLED", "HELD", "CANCELLED");
        verify(events).publish(new PreorderEvents.Closed(1, "BATCH_CANCELLED"));
        verify(events).publish(new PreorderEvents.Closed(3, "BATCH_CANCELLED"));
    }

    @Test
    void aLineListedTwiceIsHandledOnce() {
        queueOfLine();

        port.onBatchCancelled(List.<byte[][]>of(new byte[][]{productId, null}, new byte[][]{productId, null}), false, NOW);

        verify(events).publish(new PreorderEvents.BatchCancelledKept(1));
    }

    @Test
    void waitingByLineCountsPeopleAndUnitsPerLine() {
        when(subs.demand(NOW)).thenReturn(List.<Object[]>of(new Object[]{productId, null, 3L, 5L}));

        Map<String, long[]> out = port.waitingByLine();

        assertThat(out).hasSize(1);
        assertThat(out.values().iterator().next()).containsExactly(3L, 5L);
    }
}
