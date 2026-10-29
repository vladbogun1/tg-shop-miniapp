package com.maxsolch.shop.it;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.costing.LotLedger;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.service.CreateOrderCommand;
import com.maxsolch.shop.tg.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * Base of the integration tests: the whole Spring context, Flyway migrations and a REAL MySQL 8.4.
 *
 * <p>The database comes from the same variables the application reads ({@code DB_HOST}, {@code DB_PORT},
 * {@code DB_NAME}, {@code DB_USER}, {@code DB_PASSWORD}) — in CI it is the service container of the
 * {@code backend-integration} job, locally any MySQL 8.4 (docs/INTEGRATION-TESTS.md). Tests commit for
 * real (locks and after-commit events are the point), so every test creates its own products and orders
 * with fresh ids and never relies on an empty database.
 *
 * <p>Everything outside the database is a stub: Telegram goes through a mocked {@link NotificationService},
 * MinIO through a mocked {@link ImageStorageService}; there are no tokens and no network calls (the bot,
 * monobank and Nova Poshta stay off because their keys are blank).
 */
@SpringBootTest(properties = {
        // StartupSecurityCheck refuses the public placeholder of application.yml. A throw-away test value:
        "app.security.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtZm9yLWludGVncmF0aW9uLXRlc3Rz",
        "app.geoip.enabled=false"
})
public abstract class AbstractMysqlIT {

    @MockitoBean
    protected NotificationService notificationService;

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

    protected TransactionTemplate tx;
    protected String paymentOptionId;

    @BeforeEach
    void baseSetUp() {
        tx = new TransactionTemplate(txManager);
        PaymentOption po = new PaymentOption();
        po.setTitle("IT: оплата онлайн");
        po.setSortOrder(0);
        paymentOptionId = UuidUtil.toString(paymentOptions.save(po).getId());
        Mockito.reset(notificationService);
    }

    /** A product with {@code stock} units, split into the FIFO lots given (their sum must be the stock). */
    protected Product product(long priceMinor, int... lotSizes) {
        int stock = java.util.Arrays.stream(lotSizes).sum();
        Product p = new Product();
        p.setTitle("IT товар " + UUID.randomUUID().toString().substring(0, 8));
        p.setSlug("it-" + UUID.randomUUID());
        p.setPriceMinor(priceMinor);
        p.setStock(0);
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
