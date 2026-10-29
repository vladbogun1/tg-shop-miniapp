package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** The product row is locked FOR UPDATE: of N checkouts of the last unit exactly one passes. */
class OrderConcurrentCheckoutIT extends AbstractMysqlIT {

    @Autowired
    Checkout orders;

    @Test
    void ofSeveralParallelCheckoutsOfTheLastUnitExactlyOnePasses() throws Exception {
        Product p = product(10_000, 1);
        int buyers = 6;
        ExecutorService pool = Executors.newFixedThreadPool(buyers);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < buyers; i++) {
            long tg = 8_000 + i;
            String phone = "+38067222000" + i;
            Callable<Boolean> task = () -> {
                go.await();
                try {
                    orders.createOrder(checkout(tg, phone, p, 1));
                    return true;
                } catch (DomainException.BadRequest outOfStock) {
                    return false;
                }
            };
            results.add(pool.submit(task));
        }
        go.countDown();
        int passed = 0;
        for (Future<Boolean> f : results) {
            if (f.get(60, TimeUnit.SECONDS)) {
                passed++;
            }
        }
        pool.shutdown();

        assertThat(passed).isEqualTo(1);
        assertThat(stockOf(p)).isZero();
        assertThat(lotsLeftOf(p)).isZero();
        Integer sold = jdbc.queryForObject(
                "SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE product_id = ?", Integer.class, p.getId());
        assertThat(sold).isEqualTo(1);
    }
}
