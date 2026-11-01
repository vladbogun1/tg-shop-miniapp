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
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

/**
 * The clock of holds ({@link PreorderJobs}): holds and notices past their deadline end and the units pass
 * on through {@link PreorderQueueService#handOut}; holds about to end get one reminder.
 */
@Slf4j
@Service
public class PreorderHoldExpiry {

    static final Duration REMIND_BEFORE = Duration.ofHours(3);

    private final PreorderSubscriptionRepository subs;
    private final Products products;
    private final DomainEvents events;
    private final PreorderQueueService queue;
    private final Clock clock;
    private final TransactionTemplate tx;

    public PreorderHoldExpiry(PreorderSubscriptionRepository subs, Products products, DomainEvents events,
                              PreorderQueueService queue, Clock clock, PlatformTransactionManager txManager) {
        this.tx = new TransactionTemplate(txManager);
        this.subs = subs;
        this.products = products;
        this.events = events;
        this.queue = queue;
        this.clock = clock;
    }

    /**
     * Ends holds and notices past their deadline; held units pass to the next person.
     *
     * <p>Not {@code @Transactional}: every hold is its own short transaction, so one bad row rolls back only itself
     * (it is logged and the rest go on) and no lock outlives a hold. The page of candidates is walked in
     * product-id, then hold-id order — a fixed order, instead of by deadline, which is how checkout and this job
     * could meet on the same two products from opposite ends.
     */
    public int expireHolds() {
        Instant now = clock.instant();
        List<Object[]> candidates = new ArrayList<>(subs.findExpiredHoldIds(now, PageRequest.of(0, 50)));
        candidates.sort(Comparator.<Object[], String>comparing(c -> HexFormat.of().formatHex((byte[]) c[1]))
                .thenComparingLong(c -> ((Number) c[0]).longValue()));
        int done = 0;
        for (Object[] candidate : candidates) {
            long id = ((Number) candidate[0]).longValue();
            try {
                if (Boolean.TRUE.equals(tx.execute(status -> expireOne(id, (byte[]) candidate[1], now)))) {
                    done++;
                }
            } catch (RuntimeException e) {
                log.warn("Preorder hold {} was not expired: {}", id, e.toString());
            }
        }
        return done;
    }

    private boolean expireOne(long id, byte[] productId, Instant now) {
        // product lock first (like checkout), then the place itself, read fresh: a buyer who held the
        // lock before us may have bought the hold meanwhile — then there is nothing to expire
        Product product = products.findByIdForUpdate(productId).orElse(null);
        PreorderSubscription s = subs.findForUpdate(id).orElse(null);
        if (s == null || !(s.getStatus() == Status.HELD || s.getStatus() == Status.NOTIFIED)
                || s.getHoldUntil() == null || !s.getHoldUntil().isBefore(now)) {
            return false;
        }
        boolean wasHeld = s.getStatus() == Status.HELD;
        s.close(Status.EXPIRED, wasHeld ? "бронь закончилась" : "не купил после уведомления", now);
        subs.save(s);
        events.publish(new PreorderEvents.HoldExpired(s.getId()));
        if (wasHeld && product != null) {
            queue.holdsChanged(product);
            queue.handOut(product, product.variant(s.getVariantId()), s.getBatchId(), Distribution.QUEUE_HOLD,
                    queue.holdHours(s.getBatchId()), false);
        }
        return true;
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
