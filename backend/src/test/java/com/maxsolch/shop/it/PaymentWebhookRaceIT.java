package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.payment.app.PaymentStatusApplier;
import com.maxsolch.shop.payment.domain.MonobankInvoiceStatus;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A monobank webhook and a status poll for the same invoice arrive at once: the invoice row is locked
 * FOR UPDATE, so the money is credited once — one PAYMENT row in the journal, {@code received} = the amount.
 */
class PaymentWebhookRaceIT extends AbstractMysqlIT {

    @Autowired
    Checkout checkout;
    @Autowired
    PaymentInvoiceRepository invoices;
    @Autowired
    PaymentStatusApplier applier;

    @Test
    void webhookAndPollAtTheSameTimeCreditTheOrderOnce() throws Exception {
        Product p = product(5_000, 3);
        Order o = checkout.createOrder(checkout(9_201, "+380673330201", p, 1));
        String extId = "race-" + UuidUtil.toString(o.getId()).substring(0, 12);
        PaymentInvoice inv = new PaymentInvoice();
        OrderFixtures.set(inv, "id", UuidUtil.randomBytes());
        OrderFixtures.set(inv, "orderId", o.getId());
        OrderFixtures.set(inv, "externalId", extId);
        OrderFixtures.set(inv, "amountMinor", 5_000);
        OrderFixtures.set(inv, "pageUrl", "https://example.invalid/pay");
        OrderFixtures.set(inv, "expiresAt", Instant.now().plus(1, ChronoUnit.HOURS));
        tx.executeWithoutResult(s -> invoices.save(inv));

        MonobankInvoiceStatus success = new MonobankInvoiceStatus(extId, PaymentInvoice.SUCCESS, null, null,
                5_000L, 980, 5_000L, null, null, null, null, null);
        int callers = 6; // webhook retries and polls
        ExecutorService pool = Executors.newFixedThreadPool(callers);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < callers; i++) {
            results.add(pool.submit(() -> {
                go.await();
                return applier.apply(success);
            }));
        }
        go.countDown();
        for (Future<Boolean> f : results) {
            assertThat(f.get(60, TimeUnit.SECONDS)).isTrue();
        }
        pool.shutdown();

        Integer payments = jdbc.queryForObject("SELECT COUNT(*) FROM order_money_movements "
                + "WHERE order_id = ? AND kind = 'PAYMENT'", Integer.class, o.getId());
        Long moved = jdbc.queryForObject("SELECT COALESCE(SUM(amount_minor), 0) FROM order_money_movements "
                + "WHERE order_id = ? AND kind = 'PAYMENT'", Long.class, o.getId());
        assertThat(payments).isEqualTo(1);
        assertThat(moved).isEqualTo(5_000L);
        assertThat(longOf("received_minor", o.getId())).isEqualTo(5_000L);
        assertThat(jdbc.queryForObject("SELECT applied_at IS NOT NULL FROM payment_invoices WHERE id = ?",
                Boolean.class, inv.getId())).isTrue();
    }
}
