package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.OrderCustomerNotifier;
import com.maxsolch.shop.order.app.OrderSellerNotifier;
import org.junit.jupiter.api.AfterEach;
import com.maxsolch.shop.order.app.OrderNotificationListener;
import com.maxsolch.shop.platform.jobs.Workers;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionHandler;
import java.util.concurrent.TimeUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Base of the integration tests: the whole Spring context, Flyway migrations and a REAL MySQL 8.4.
 *
 * <p>The database comes from the same variables the application reads ({@code DB_HOST}, {@code DB_PORT},
 * {@code DB_NAME}, {@code DB_USER}, {@code DB_PASSWORD}) — in CI it is the service container of the
 * {@code backend-integration} job, locally any MySQL 8.4 (docs/INTEGRATION-TESTS.md). Tests commit for
 * real (locks and after-commit events are the point), so every test creates its own products and orders
 * with fresh ids and never relies on an empty database.
 *
 * <p>Everything outside the database is a stub: Telegram goes through mocked {@link OrderSellerNotifier} and {@link OrderCustomerNotifier},
 * MinIO through a mocked {@link ImageStorageService}; there are no tokens and no network calls (the bot,
 * monobank and Nova Poshta stay off because their keys are blank).
 */
@SpringBootTest(properties = {
        // StartupSecurityCheck refuses the public placeholder of application.yml. A throw-away test value:
        "app.security.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtZm9yLWludGVncmF0aW9uLXRlc3Rz",
        "app.geoip.enabled=false",
        // the AI queue worker is driven by hand in the AI tests (it would take their jobs)
        "app.ai.worker-enabled=false"
})
@Import(AbstractMysqlIT.InlineNotifications.class)
public abstract class AbstractMysqlIT {

    /** The order notifications run on the committing thread, so tests can assert right after the commit. */
    @TestConfiguration
    static class InlineNotifications {
        @Bean
        @Primary
        Workers inlineWorkers() {
            return new Workers() {
                @Override
                public ExecutorService bounded(String name, int capacity, RejectedExecutionHandler onFull,
                                               Duration drainOnStop) {
                    if (!OrderNotificationListener.WORKER.equals(name)) {
                        return super.bounded(name, capacity, onFull, drainOnStop);
                    }
                    return new AbstractExecutorService() {
                        public void execute(Runnable r) { r.run(); }
                        public void shutdown() { }
                        public List<Runnable> shutdownNow() { return List.of(); }
                        public boolean isShutdown() { return false; }
                        public boolean isTerminated() { return false; }
                        public boolean awaitTermination(long t, TimeUnit u) { return true; }
                    };
                }
            };
        }
    }


    @MockitoBean
    protected OrderSellerNotifier sellerNotifier;

    @MockitoBean
    protected OrderCustomerNotifier customerNotifier;

    @MockitoBean
    protected ImageStorageService imageStorageService;

    @Autowired
    protected ProductRepository products;
    @Autowired
    protected PaymentOptionRepository paymentOptions;
    @Autowired
    protected LotLedger lots;
    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected PlatformTransactionManager txManager;

    private List<String> driftBefore = List.of();

    protected TransactionTemplate tx;
    protected String paymentOptionId;

    @BeforeEach
    void baseSetUp() {
        tx = new TransactionTemplate(txManager);
        driftBefore = driftedOrders();
        PaymentOption po = new PaymentOption();
        po.setTitle("IT: оплата онлайн");
        po.setSortOrder(0);
        paymentOptionId = UuidUtil.toString(paymentOptions.save(po).getId());
        Mockito.reset(sellerNotifier, customerNotifier);
    }

    /**
     * Watchdog of the money journal: whatever the test did, every order's {@code received − refunded} equals the
     * journal's net (payments + corrections − refunds). A scenario that moves an order's money without its journal
     * line fails here. The same check runs nightly in production (LedgerDriftJob).
     */
    @AfterEach
    void moneyJournalMatchesOrders() {
        if (!checksMoneyJournal()) {
            return;
        }
        List<String> drift = driftedOrders();
        drift.removeAll(driftBefore);
        assertThat(drift).as("orders whose money columns disagree with the money journal").isEmpty();
    }

    /** A test that writes orders with raw SQL on purpose (hand-built history) opts out of the watchdog. */
    protected boolean checksMoneyJournal() {
        return true;
    }

    private List<String> driftedOrders() {
        return new java.util.ArrayList<>(jdbc.queryForList("""
                SELECT CONCAT(bin_to_uuid(o.id), ' order=', o.received_minor - o.refunded_minor,
                              ' journal=', COALESCE(j.net, 0))
                FROM orders o
                LEFT JOIN (SELECT order_id,
                                  SUM(CASE kind WHEN 'PAYMENT' THEN amount_minor WHEN 'CORRECTION' THEN amount_minor
                                                WHEN 'REFUND' THEN -amount_minor ELSE 0 END) net
                           FROM order_money_movements GROUP BY order_id) j ON j.order_id = o.id
                WHERE COALESCE(j.net, 0) <> o.received_minor - o.refunded_minor
                """, String.class));
    }

    /** A product with {@code stock} units, split into the FIFO lots given (their sum must be the stock). */
    protected Product product(long priceMinor, int... lotSizes) {
        int stock = java.util.Arrays.stream(lotSizes).sum();
        Product p = new Product();
        p.retitle("IT товар " + UUID.randomUUID().toString().substring(0, 8));
        p.changeSlug("it-" + UUID.randomUUID());
        p.reprice(priceMinor);
        p.changeStock(0);
        Product saved = products.save(p);
        // Each sync() with a higher stock opens one MANUAL lot of the difference: lots of the given sizes, oldest first.
        int running = 0;
        for (int size : lotSizes) {
            running += size;
            lots.sync(saved.getId(), null, running);
        }
        jdbc.update("UPDATE products SET stock = ? WHERE id = ?", stock, saved.getId());
        return saved;
    }

    protected static String id(Product p) {
        return UuidUtil.toString(p.getId());
    }

    protected CreateOrderCommand checkout(long tgUserId, String phone, Product p, int qty) {
        return new CreateOrderCommand(null, tgUserId, "it_user", List.of(new CreateOrderCommand.Line(id(p), null, qty)),
                "IT Покупатель", phone, null, null, "PICKUP", null, null, null, null, paymentOptionId);
    }

    protected int stockOf(Product p) {
        Integer n = jdbc.queryForObject("SELECT stock FROM products WHERE id = ?", Integer.class, p.getId());
        return n == null ? -1 : n;
    }

    /** Σ qty_left of the product's FIFO lots — the ledger must always equal {@code products.stock}. */
    protected int lotsLeftOf(Product p) {
        Integer n = jdbc.queryForObject(
                "SELECT COALESCE(SUM(qty_left), 0) FROM stock_lots WHERE product_id = ?", Integer.class, p.getId());
        return n == null ? -1 : n;
    }

    protected List<Integer> lotQtyLeft(Product p) {
        return jdbc.queryForList("SELECT qty_left FROM stock_lots WHERE product_id = ? ORDER BY id", Integer.class, p.getId());
    }

    protected String statusOf(byte[] orderId) {
        return jdbc.queryForObject("SELECT status FROM orders WHERE id = ?", String.class, orderId);
    }

    protected long longOf(String column, byte[] orderId) {
        Long n = jdbc.queryForObject("SELECT " + column + " FROM orders WHERE id = ?", Long.class, orderId);
        return n == null ? -1 : n;
    }
}
