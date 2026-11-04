package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoney;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Tells the customer about a top-up (V80): a paid online order got more expensive (the admin added an item or
 * pressed «+» at a quantity) — the bot sends «Потрібна доплата N ₴» with a button to the order, where «Доплатити»
 * waits. Not on every edit: once the order has not changed for {@link #QUIET} (a series of «+» is over, the admin
 * had time to choose наложку or to waive it), and once per top-up — {@code orders.topup_notice} remembers what was
 * said, so the same amount is not repeated and a new one (another item, наложка chosen) is.
 *
 * <p>The notice is written before the message goes out: at most one message, even if Telegram hangs past the
 * next run. The admin's «уведомить» on the edit itself is not needed for this — without the message the customer
 * did not know there was anything to pay (order #d097e8b4, 04.11.2026).
 */
@Slf4j
@Component
public class TopUpNoticeJobs {

    static final Duration QUIET = Duration.ofSeconds(90);
    /** Orders not touched for that long are left alone (no message about a week-old change after a release). */
    static final Duration LOOKBACK = Duration.ofDays(3);

    private final OrderRepository orders;
    private final OrderCustomerNotifier customer;
    private final Clock clock;
    private final TransactionTemplate tx;

    TopUpNoticeJobs(OrderRepository orders, OrderCustomerNotifier customer, Clock clock,
                 PlatformTransactionManager txManager) {
        this.orders = orders;
        this.customer = customer;
        this.clock = clock;
        this.tx = new TransactionTemplate(txManager);
    }

    @SchedulerLock(name = "TopUpNoticeJobs.run", lockAtMostFor = "PT5M", lockAtLeastFor = "PT10S")
    @Scheduled(fixedDelayString = "${app.order.topup-notice-ms:30000}", initialDelay = 60_000)
    public void run() {
        Instant now = clock.instant();
        List<byte[]> ids = orders.findTopUpCandidateIds(now.minus(QUIET), now.minus(LOOKBACK));
        for (byte[] id : ids) {
            try {
                notifyOne(id);
            } catch (RuntimeException e) {
                log.warn("Top-up notice for order {} failed: {}", UuidUtil.toString(id), e.toString());
            }
        }
    }

    /** Sends the top-up message of one order when it has not been sent for this amount and way yet. */
    void notifyOne(byte[] id) {
        Order order = tx.execute(s -> orders.findById(id).orElse(null));
        String notice = order == null ? null : OrderMoney.topUpNotice(order);
        if (notice == null || notice.equals(order.getTopupNotice())) {
            return;
        }
        tx.executeWithoutResult(s -> orders.updateTopUpNotice(id, notice));
        customer.notifyCustomerTopUp(order, OrderMoney.topUpDueMinor(order));
    }
}
