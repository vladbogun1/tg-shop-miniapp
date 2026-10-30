package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.domain.PreorderSubscription.Status;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * The clock of holds ({@link PreorderJobs}): holds and notices past their deadline end and the units pass
 * on through {@link PreorderQueueService#handOut}; holds about to end get one reminder.
 */
@Service
public class PreorderHoldExpiry {

    static final Duration REMIND_BEFORE = Duration.ofHours(3);

    private final PreorderSubscriptionRepository subs;
    private final Products products;
    private final DomainEvents events;
    private final PreorderQueueService queue;
    private final Clock clock;

    public PreorderHoldExpiry(PreorderSubscriptionRepository subs, Products products, DomainEvents events,
                              PreorderQueueService queue, Clock clock) {
        this.subs = subs;
        this.products = products;
        this.events = events;
        this.queue = queue;
        this.clock = clock;
    }

    /** Ends holds and notices past their deadline; held units pass to the next person. */
    @Transactional
    public int expireHolds() {
        Instant now = clock.instant();
        int done = 0;
        for (Object[] candidate : subs.findExpiredHoldIds(now, PageRequest.of(0, 50))) {
            // product lock first (like checkout), then the place itself, read fresh: a buyer who held the
            // lock before us may have bought the hold meanwhile — then there is nothing to expire
            Product product = products.findByIdForUpdate((byte[]) candidate[1]).orElse(null);
            PreorderSubscription s = subs.findForUpdate(((Number) candidate[0]).longValue()).orElse(null);
            if (s == null || !(s.statusEnum() == Status.HELD || s.statusEnum() == Status.NOTIFIED)
                    || s.getHoldUntil() == null || !s.getHoldUntil().isBefore(now)) {
                continue;
            }
            boolean wasHeld = s.statusEnum() == Status.HELD;
            s.close(Status.EXPIRED, wasHeld ? "бронь закончилась" : "не купил после уведомления", now);
            subs.save(s);
            events.publish(new PreorderEvents.HoldExpired(s.getId()));
            done++;
            if (wasHeld && product != null) {
                queue.holdsChanged(product);
                queue.handOut(product, Lines.variantById(product, s.getVariantId()), s.getBatchId(), Distribution.QUEUE_HOLD,
                        queue.holdHours(s.getBatchId()), false);
            }
        }
        return done;
    }

    /** One reminder per hold, {@link #REMIND_BEFORE} before it ends. */
    @Transactional
    public int remindHolds() {
        Instant now = clock.instant();
        List<PreorderSubscription> due = subs.findHoldsToRemind(now, now.plus(REMIND_BEFORE), PageRequest.of(0, 100));
        for (PreorderSubscription s : due) {
            s.setRemindedAt(now);
            events.publish(new PreorderEvents.HoldEnding(s.getId()));
        }
        subs.saveAll(due);
        return due.size();
    }
}
