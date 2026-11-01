package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.OrderIdempotencyService;
import com.maxsolch.shop.order.app.OrderPlacement;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** One Idempotency-Key is one order, even when the requests arrive at the same moment. */
class OrderIdempotencyIT extends AbstractMysqlIT {

    @Autowired
    OrderPlacement placement;
    @Autowired
    OrderIdempotencyService idempotency;
    @Autowired
    com.maxsolch.shop.customer.app.Customers customers;

    /** A buyer row (orders.user_id is a foreign key to it), unique per run. */
    private long buyer(long base) {
        long id = base + (System.nanoTime() % 100_000);
        jdbc.update("INSERT INTO users (telegram_user_id, username, created_at, last_seen_at, is_premium, bot_blocked) "
                + "VALUES (?, ?, NOW(), NOW(), FALSE, FALSE)", id, "it_" + id);
        return id;
    }

    private com.maxsolch.shop.order.app.CreateOrderCommand order(long user, String phone, Product p) {
        return new com.maxsolch.shop.order.app.CreateOrderCommand(user, user, "it_user",
                List.of(new com.maxsolch.shop.order.app.CreateOrderCommand.Line(id(p), null, 1)),
                "IT Покупатель", phone, null, null, "PICKUP", null, null, null, null, paymentOptionId);
    }

    @Test
    void parallelCheckoutsWithOneKeyMakeOneOrder() throws Exception {
        Product p = product(10_000, 10);
        long user = buyer(9_100_000L);
        String key = "it-key-" + System.nanoTime();
        int taps = 5;
        ExecutorService pool = Executors.newFixedThreadPool(taps);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<OrderPlacement.Placed>> results = new ArrayList<>();
        for (int i = 0; i < taps; i++) {
            results.add(pool.submit(() -> {
                go.await();
                return placement.place(user, false, key, order(user, "+380672220099", p));
            }));
        }
        go.countDown();
        List<String> ids = new ArrayList<>();
        for (Future<OrderPlacement.Placed> f : results) {
            ids.add(f.get(60, TimeUnit.SECONDS).orderId());
        }
        pool.shutdown();

        assertThat(ids).hasSize(taps).containsOnly(ids.get(0));
        Integer orders = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_items WHERE product_id = ?", Integer.class, p.getId());
        assertThat(orders).isEqualTo(1);
        assertThat(stockOf(p)).isEqualTo(9);
    }

    @Test
    void aRetryAfterTheOrderIsStoredGetsTheSameOrderBack() {
        Product p = product(10_000, 10);
        long user = buyer(9_200_000L);
        String key = "it-retry-" + System.nanoTime();

        OrderPlacement.Placed first = placement.place(user, false, key, order(user, "+380672220098", p));
        OrderPlacement.Placed again = placement.place(user, false, key, order(user, "+380672220098", p));

        assertThat(again.orderId()).isEqualTo(first.orderId());
        assertThat(stockOf(p)).isEqualTo(9);
    }

    @Test
    void theBuyersRowLockMakesTheirSecondCheckoutWaitForTheFirst() throws Exception {
        Product p = product(10_000, 10);
        long user = buyer(9_400_000L);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<OrderPlacement.Placed> second;
        try {
            second = tx.execute(status -> {
                customers.lockForUpdate(user);
                Future<OrderPlacement.Placed> f = pool.submit(
                        () -> placement.place(user, false, null, order(user, "+380672220097", p)));
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                assertThat(f.isDone()).as("waits while the first transaction of the buyer is open").isFalse();
                return f;
            });
            assertThat(second.get(30, TimeUnit.SECONDS).orderId()).isNotBlank();
        } finally {
            pool.shutdown();
        }
    }

    @Test
    void cleanupDropsOldKeysOnly() {
        long user = 9_300_000L;
        jdbc.update("INSERT INTO order_idempotency (user_id, idem_key, created_at) VALUES (?, 'old', ?)",
                user, java.sql.Timestamp.from(Instant.now().minusSeconds(3 * 86_400L)));
        jdbc.update("INSERT INTO order_idempotency (user_id, idem_key, created_at) VALUES (?, 'new', ?)",
                user, java.sql.Timestamp.from(Instant.now()));

        idempotency.deleteOlderThan(Instant.now().minusSeconds(86_400L));

        List<String> left = jdbc.queryForList(
                "SELECT idem_key FROM order_idempotency WHERE user_id = ?", String.class, user);
        assertThat(left).containsExactly("new");
    }
}
