package com.maxsolch.shop.it;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.domain.SpecAttribute;
import com.maxsolch.shop.catalog.domain.SpecGroup;
import com.maxsolch.shop.catalog.domain.SpecOption;
import com.maxsolch.shop.catalog.domain.SpecType;
import com.maxsolch.shop.catalog.infra.BrandRepository;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.SpecAttributeRepository;
import com.maxsolch.shop.catalog.infra.SpecOptionRepository;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.notification.domain.TelegramGateway;
import com.maxsolch.shop.notification.infra.TelegramBotConfig;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.MessageService;
import com.maxsolch.shop.order.app.OrderEditing;
import com.maxsolch.shop.order.app.OrderEvents;
import com.maxsolch.shop.order.app.OrderLifecycle;
import com.maxsolch.shop.order.app.OrderPayments;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.domain.PreorderEvents;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.returns.app.Returns;
import com.maxsolch.shop.returns.domain.LineOutcome;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.support.app.SupportService;
import com.maxsolch.shop.review.domain.ReviewEvents;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.telegram.telegrambots.meta.api.methods.BotApiMethod;
import org.telegram.telegrambots.meta.api.methods.send.SendDocument;
import org.telegram.telegrambots.meta.api.methods.send.SendMessage;
import org.telegram.telegrambots.meta.api.objects.Message;
import org.telegram.telegrambots.meta.exceptions.TelegramApiException;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * With {@code spring.jpa.open-in-view: false} a lazy association read outside a transaction fails with
 * {@code LazyInitializationException}. This test walks every non-admin endpoint (Mini App {@code /api/me/**},
 * the login, the public catalog and site, sitemap, cart, promo, reviews, support, preorders, payment options,
 * Nova Poshta directory) as a real customer against real MySQL, with data that has variants, photos,
 * characteristics, orders in every status (gift, return, payment), a review, a support thread and a preorder -
 * and then checks two things:
 *
 * <ul>
 *   <li>no request ends in a 5xx or an error body;</li>
 *   <li>nothing in the log mentions a lazy-loading failure. The notifiers and the AFTER_COMMIT listeners
 *       catch and log their own exceptions (a bot hiccup must not break an order), so a failure there never
 *       reaches the response - the log is the only place it shows up. Telegram is a fake gateway that
 *       accepts everything, so the listeners really build their texts.</li>
 * </ul>
 */
@SpringBootTest(properties = {
        // StartupSecurityCheck refuses the public placeholder of application.yml. A throw-away test value:
        "app.security.jwt-secret=dGVzdC1vbmx5LWp3dC1zZWNyZXQtZm9yLWludGVncmF0aW9uLXRlc3Rz",
        "app.geoip.enabled=false",
        // a fake token and chat: the notifiers go all the way to the gateway, which is a fake below
        "app.telegram.bot-token=123456:IT-FAKE-TOKEN",
        "app.telegram.bot-username=it_bot",
        "app.telegram.notify-chat-id=-1001234567890"
})
@AutoConfigureMockMvc
class ClientEndpointsLazyLoadingIT {

    /** Records every Telegram call and answers like the real API would (a sent message has an id). */
    static class FakeTelegram implements TelegramGateway {
        final List<String> calls = new java.util.concurrent.CopyOnWriteArrayList<>();
        private final AtomicInteger ids = new AtomicInteger(1000);

        @Override
        @SuppressWarnings("unchecked")
        public <T extends Serializable, M extends BotApiMethod<T>> T execute(M method) throws TelegramApiException {
            calls.add(method.getClass().getSimpleName());
            if (method instanceof SendMessage) {
                Message m = new Message();
                m.setMessageId(ids.incrementAndGet());
            m.setChat(new org.telegram.telegrambots.meta.api.objects.Chat(-1001234567890L, "supergroup"));
                return (T) m;
            }
            return null;
        }

        @Override
        public Message execute(SendDocument document) {
            calls.add("SendDocument");
            Message m = new Message();
            m.setMessageId(ids.incrementAndGet());
            m.setChat(new org.telegram.telegrambots.meta.api.objects.Chat(-1001234567890L, "supergroup"));
            return m;
        }
    }

    @TestConfiguration
    static class Fakes {
        @Bean
        @Primary
        FakeTelegram fakeTelegram() {
            return new FakeTelegram();
        }
    }

    @MockitoBean
    TelegramBotConfig botConfig; // no long polling, no network
    @MockitoBean
    ImageStorageService imageStorageService;

    @Autowired
    MockMvc mvc;
    @Autowired
    FakeTelegram telegram;
    @Autowired
    JwtService jwt;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PlatformTransactionManager txManager;
    @Autowired
    ApplicationEventPublisher events;
    @Autowired
    SettingsService settings;
    @Autowired
    ProductRepository products;
    @Autowired
    CategoryRepository categories;
    @Autowired
    BrandRepository brands;
    @Autowired
    SpecAttributeRepository specAttributes;
    @Autowired
    SpecOptionRepository specOptions;
    @Autowired
    com.maxsolch.shop.catalog.infra.SpecGroupRepository specGroups;
    @Autowired
    UserRepository users;
    @Autowired
    PaymentOptionRepository paymentOptions;
    @Autowired
    PromoCodeRepository promoCodes;
    @Autowired
    LotLedger lots;
    @Autowired
    Checkout checkout;
    @Autowired
    OrderEditing editing;
    @Autowired
    OrderLifecycle lifecycle;
    @Autowired
    OrderPayments payments;
    @Autowired
    Returns returns;
    @Autowired
    MessageService orderChat;
    @Autowired
    SupportService support;
    @Autowired
    com.maxsolch.shop.review.app.ReviewReminderJob reviewReminder;
    @Autowired
    com.maxsolch.shop.review.app.BonusExpiryReminderJob bonusReminder;
    @Autowired
    com.maxsolch.shop.gift.app.GiftCasePromoReminderJob giftReminder;
    @Autowired
    com.maxsolch.shop.preorder.app.PreorderDigestJob preorderDigest;
    @Autowired
    com.maxsolch.shop.preorder.app.PreorderJobs preorderHolds;
    @Autowired
    com.maxsolch.shop.support.app.SupportJobs supportJobs;
    @Autowired
    com.maxsolch.shop.payment.app.PaymentJobs paymentJobs;
    @Autowired
    com.maxsolch.shop.payment.app.ReceiptDeliveryJob receiptJob;

    // ---- the seed, built once for the whole class ----
    private static boolean seeded;
    private static final long TG = 7_000_000_000L + ThreadLocalRandom.current().nextInt(1_000_000);
    private static final String PROMO = "IT" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    private static final long OTHER_TG = TG + 1;
    private static String token;
    private static String productA;       // variants + photos + specs + brand + category
    private static String productAVariant;
    private static String productAVariantB;
    private static String productAItemSlug;
    private static String productB;       // simple product, no variants
    private static String productSoldOut; // the preorder one
    private static String categorySlug;
    private static String paymentOptionId;
    private static final Map<String, String> orders = new LinkedHashMap<>();
    private static String supportThread;
    private static final List<String> giftCaseOrders = new ArrayList<>();
    private static ListAppender<ILoggingEvent> logs;
    private static final List<String> covered = new ArrayList<>();

    @BeforeAll
    static void captureLogs() {
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME)).addAppender(logs);
    }

    @AfterAll
    static void report() {
        ((Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME)).detachAppender(logs);
        java.util.TreeSet<String> distinct = new java.util.TreeSet<>();
        for (String c : covered) {
            distinct.add(c.replaceAll("[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}", "{id}").replaceAll("/[0-9]+( |$)", "/{n}$1")
                    .replaceAll("/by-slug/[^ ]+", "/by-slug/{slug}").replaceAll("/categories/it-[^ ]+", "/categories/{slug}")
                    .replaceAll(" -> .*", ""));
        }
        System.out.println("CLIENT-ENDPOINTS requests: " + covered.size() + ", distinct method+path: " + distinct.size());
        distinct.forEach(d -> System.out.println("CLIENT-ENDPOINTS  " + d));
    }

    @BeforeEach
    void seed() {
        synchronized (ClientEndpointsLazyLoadingIT.class) {
            if (seeded) {
                return;
            }
            seeded = true;
            doSeed();
        }
    }

    // ================================================================== the tests

    @Test
    void publicCatalogAndSite() throws Exception {
        for (String lang : List.of("uk", "ru", "en")) {
            ok(get("/api/app-info", null, lang));
            ok(get("/api/public/categories", null, lang));
            ok(get("/api/public/categories/" + categorySlug, null, lang));
            ok(get("/api/public/catalog/schema", null, lang));
            ok(get("/api/catalog/schema", null, lang));
            ok(get("/api/public/products", null, lang));
            ok(get("/api/public/products?category=" + categorySlug, null, lang));
            ok(get("/api/public/products?view=card&all=1", null, lang));
            ok(get("/api/public/products?q=IT&sort=price_asc&inStock=true&priceMax=999999&page=0&size=5", null, lang));
            ok(get("/api/public/products?sort=price_desc", null, lang));
            ok(get("/api/public/products/by-slug/" + productAItemSlug, null, lang));
            ok(get("/api/products", null, lang));
            ok(get("/api/products/" + productA, null, lang));
            ok(get("/api/products/" + productB, null, lang));
            ok(get("/api/public/gift", null, lang));
            ok(get("/api/payment-options", null, lang));
            ok(get("/api/public/products/" + productA + "/reviews", null, lang));
            ok(get("/api/public/products/" + productAItemSlug + "/reviews?page=0&size=5", null, lang));
            ok(get("/api/public/reviews/latest?size=10", null, lang));
        }
        ok(get("/api/public/sitemap", null, "uk"));
        ok(get("/api/public/order-limits", null, "uk"));
        ok(get("/api/public/support/config", null, "uk"));
        ok(get("/api/public/preorders", null, "uk"));
        ok(get("/api/public/products/" + productSoldOut + "/preorder", null, "uk"));
        ok(get("/api/promo-codes/preview?code=" + PROMO + "&subtotalMinor=50000", null, "uk"));
        ok(get("/api/promo-codes/preview?code=NOPE&subtotalMinor=50000", null, "uk"));
        // Nova Poshta directory: an empty or tiny cache is fine, it must answer
        ok(get("/api/np/cities?q=Ки", null, "uk"));
        ok(get("/api/np/warehouses?cityRef=00000000-0000-0000-0000-000000000000", null, "uk"));
        ok(get("/api/np/warehouses/bbox?minLat=50&maxLat=51&minLng=30&maxLng=31&category=all", null, "uk"));
        // refused-by-design requests must be 4xx, never a 500
        notServerError(get("/api/media?key=products/x.jpg&exp=1&sig=bad", null, "uk"));
        notServerError(get("/api/receipts/file?id=x&sig=bad", null, "uk"));
        notServerError(get("/api/auth/web/status?loginId=" + UUID.randomUUID(), null, "uk"));
        assertNoLazyFailures();
    }

    @Test
    void loginAndProfile() throws Exception {
        String initData = signedInitData();
        ok(post("/api/auth/telegram", null, "uk", "{\"initData\":\"" + initData.replace("\"", "\\\"") + "\"}"));
        ok(post("/api/auth/web/start", null, "uk", null));
        ok(get("/api/me", token, "uk"));
        ok(get("/api/me/sessions", token, "uk"));
        ok(post("/api/me/locale?locale=en", token, "uk", null));
        ok(post("/api/me/locale?locale=uk", token, "uk", null));
        ok(post("/api/me/analytics", token, "uk",
                "{\"sessionId\":\"it\",\"events\":[{\"event\":\"click\",\"target\":\"buy\",\"path\":\"/\",\"meta\":\"{}\"}]}"));
        ok(post("/api/public/analytics", null, "uk",
                "{\"sessionId\":\"it\",\"events\":[{\"event\":\"view\",\"target\":\"home\",\"path\":\"/\",\"meta\":\"{}\"}]}"));
        assertNoLazyFailures();
    }

    @Test
    void cartAndPromo() throws Exception {
        String lines = "{\"lines\":[{\"productId\":\"" + productA + "\",\"variantId\":\"" + productAVariant
                + "\",\"quantity\":2},{\"productId\":\"" + productB + "\",\"quantity\":1}]}";
        for (String lang : List.of("uk", "ru", "en")) {
            ok(put("/api/me/cart", token, lang, lines));
            ok(get("/api/me/cart", token, lang));
            ok(post("/api/me/cart/merge", token, lang, lines));
        }
        ok(post("/api/me/promo/reserve?code=" + PROMO + "&subtotalMinor=50000&items=" + productB + ":1", token, "uk", null));
        ok(delete("/api/me/promo/reserve?code=" + PROMO + "", token, "uk"));
        ok(post("/api/me/promo/reserve?code=" + PROMO + "&subtotalMinor=50000", token, "uk", null));
        assertNoLazyFailures();
    }

    @Test
    void ordersChatAndPayments() throws Exception {
        ok(get("/api/me/unread-count", token, "uk"));
        for (String lang : List.of("uk", "ru", "en")) {
            ok(get("/api/me/orders", token, lang));
            ok(get("/api/me/conversations", token, lang));
            for (String id : orders.values()) {
                ok(get("/api/me/orders/" + id, token, lang));
                ok(get("/api/me/orders/" + id + "/messages", token, lang));
                ok(get("/api/me/orders/" + id + "/receipts", token, lang));
            }
        }
        String chatOrder = orders.get("approvedPaidGift");
        ok(post("/api/me/orders/" + chatOrder + "/messages", token, "uk", "{\"text\":\"Добрий день, коли відправка?\"}"));
        ok(post("/api/me/orders/" + chatOrder + "/messages", token, "uk",
                "{\"text\":\"фото\",\"type\":\"PHOTO\",\"attachmentUrl\":\"chat/u" + TG + "/a.jpg\",\"fileName\":\"a.jpg\",\"mimeType\":\"image/jpeg\"}"));
        orderChat.postAdminMessage(UuidUtil.toBytes(chatOrder), 1L, "Менеджер",
                new SendMessageRequest("Відправимо завтра", null, null, null, null, null));
        ok(post("/api/me/orders/" + chatOrder + "/messages/read", token, "uk", null));
        ok(get("/api/me/orders/" + chatOrder + "/messages?limit=5", token, "uk"));
        // the customer cancels an unpaid order and asks to cancel a paid one
        ok(post("/api/me/orders/" + orders.get("newUnpaidToCancel") + "/cancel", token, "uk", "{\"reason\":\"передумав\"}"));
        ok(post("/api/me/orders/" + orders.get("paidToCancelRequest") + "/cancel-request", token, "uk", "{\"reason\":\"помилився\"}"));
        // payments: monobank is off in tests, so a refusal is the right answer (409), not a crash
        notServerError(post("/api/me/orders/" + orders.get("newUnpaid") + "/payment", token, "uk", null));
        notServerError(post("/api/me/orders/" + orders.get("newUnpaid") + "/payment/refresh", token, "uk", null));
        ok(get("/api/me/orders", token, "uk"));
        assertNoLazyFailures();
    }

    @Test
    void checkoutThroughTheApi() throws Exception {
        for (String lang : List.of("uk", "ru", "en")) {
            String buyer = freshCustomerToken();
            String body = "{\"items\":[{\"productId\":\"" + productA + "\",\"variantId\":\"" + productAVariantB
                    + "\",\"quantity\":1},{\"productId\":\"" + productB + "\",\"quantity\":1}],"
                    + "\"customerName\":\"IT Покупець\",\"phone\":\"+38067" + (1000000 + ThreadLocalRandom.current().nextInt(8999999))
                    + "\",\"deliveryMethod\":\"PICKUP\",\"promoCode\":\"" + PROMO + "\",\"paymentOptionId\":\"" + paymentOptionId + "\"}";
            MockHttpServletResponse r = post("/api/orders", buyer, lang, body, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
            ok(r);
            String orderId = new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getContentAsString()).path("orderId").asText();
            assertThat(orderId).isNotBlank();
            ok(get("/api/me/orders/" + orderId, buyer, lang));
            ok(get("/api/me/orders", buyer, lang));
        }
        assertNoLazyFailures();
    }

    @Test
    void reviews() throws Exception {
        String delivered = orders.get("deliveredWithReturn");
        for (String lang : List.of("uk", "ru", "en")) {
            ok(get("/api/me/reviews/pending", token, lang));
            ok(get("/api/me/reviews/pending?orderId=" + delivered, token, lang));
            ok(get("/api/me/reviews", token, lang));
            ok(get("/api/me/bonuses", token, lang));
        }
        Long itemId = jdbc.queryForObject("SELECT MIN(id) FROM order_items WHERE order_id = ?", Long.class,
                UuidUtil.toBytes(delivered));
        ok(post("/api/me/reviews", token, "uk", "{\"orderItemId\":" + itemId + ",\"rating\":5,\"text\":\"Чудова річ, раджу всім!\"}"));
        ok(get("/api/me/reviews", token, "uk"));
        ok(get("/api/public/products/" + productA + "/reviews", null, "uk"));
        ok(get("/api/public/reviews/latest", null, "en"));
        // the events of a review: bonus issued, moderation ping (listeners build texts and push)
        events.publishEvent(new ReviewEvents.RatingChanged(UuidUtil.toBytes(productA)));
        assertNoLazyFailures();
    }

    @Test
    void support() throws Exception {
        ok(get("/api/me/support/config", token, "uk"));
        ok(get("/api/me/support/unread-count", token, "uk"));
        for (String lang : List.of("uk", "ru", "en")) {
            ok(get("/api/me/support/threads", token, lang));
            ok(get("/api/me/support/threads/" + supportThread, token, lang));
            ok(get("/api/me/support/threads/" + supportThread + "/messages", token, lang));
        }
        ok(post("/api/me/support/threads/" + supportThread + "/messages", token, "uk", "{\"text\":\"Ще одне питання\"}"));
        ok(post("/api/me/support/threads", token, "uk", "{\"productId\":\"" + productB + "\",\"text\":\"Є в наявності?\"}"));
        ok(post("/api/me/support/threads", token, "uk", "{\"subject\":\"Загальне\",\"text\":\"Питання не про товар\"}"));
        ok(post("/api/me/support/threads/" + supportThread + "/read", token, "uk", null));
        ok(get("/api/me/support/threads", token, "uk"));
        assertNoLazyFailures();
    }

    @Test
    void preorders() throws Exception {
        for (String lang : List.of("uk", "ru", "en")) {
            ok(get("/api/me/preorders", token, lang));
            ok(get("/api/me/preorders/product/" + productSoldOut, token, lang));
            ok(get("/api/public/preorders", null, lang));
        }
        MockHttpServletResponse sub = post("/api/me/preorders", token, "uk", "{\"productId\":\"" + productSoldOut + "\",\"qty\":1}");
        ok(sub);
        ok(get("/api/me/preorders", token, "uk"));
        // every notification of the queue builds its text from the subscription, product and variant
        List<Long> subs = jdbc.queryForList("SELECT id FROM preorder_subscriptions WHERE user_id = ?", Long.class, TG);
        assertThat(subs).isNotEmpty();
        long id = subs.get(0);
        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            events.publishEvent(new PreorderEvents.Subscribed(id));
            events.publishEvent(new PreorderEvents.HoldGranted(id));
            events.publishEvent(new PreorderEvents.ArrivedNotice(id));
            events.publishEvent(new PreorderEvents.HoldEnding(id));
            events.publishEvent(new PreorderEvents.HoldExpired(id));
            events.publishEvent(new PreorderEvents.StillWaiting(id, 2));
            events.publishEvent(new PreorderEvents.BatchCancelledKept(id));
            events.publishEvent(new PreorderEvents.HoldsChanged("it"));
        });
        Long sid = id;
        ok(delete("/api/me/preorders/" + sid, token, "uk"));
        assertNoLazyFailures();
    }

    @Test
    void giftCase() throws Exception {
        assertThat(giftCaseOrders).isNotEmpty();
        Integer sealed = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE gift_case_status = 'SEALED' AND user_id = ?", Integer.class, TG);
        assertThat(sealed).as("the checkout gave the paid orders a sealed case").isPositive();
        for (String lang : List.of("uk", "ru", "en")) {
            for (String id : giftCaseOrders) {
                ok(get("/api/me/orders/" + id, token, lang));
            }
        }
        for (String id : giftCaseOrders) {
            // a refusal is a business answer (4xx); only a crash is a failure
            MockHttpServletResponse opened = post("/api/me/orders/" + id + "/gift-case/open", token, "uk", null);
            notServerError(opened);
            notServerError(post("/api/me/orders/" + id + "/gift-case/swap", token, "uk", null));
            notServerError(post("/api/me/orders/" + id + "/gift-case/size", token, "uk", "{\"variantId\":\"" + productAVariant + "\"}"));
            ok(get("/api/me/orders/" + id, token, "en"));
        }
        Integer opened = jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE gift_case_status <> 'SEALED' AND user_id = ?", Integer.class, TG);
        assertThat(opened).as("at least one case was really opened").isPositive();
        assertNoLazyFailures();
    }

    @Test
    void backgroundJobsOfTheCustomerSide() {
        // the reminders and sweeps read orders, items, products and subscriptions outside any request
        reviewReminder.run();
        bonusReminder.run();
        giftReminder.run();
        preorderDigest.daily();
        preorderHolds.holds();
        supportJobs.autoClose();
        paymentJobs.run();
        receiptJob.run();
        assertNoLazyFailures();
    }

    @Test
    void orderNotificationsAreBuiltAfterTheCommit() {
        // every order event, published after a commit like in production: the listeners re-read the order in
        // their own transaction and build the seller's cards and the customer's texts from its lines
        for (String id : orders.values()) {
            byte[] oid = UuidUtil.toBytes(id);
            new TransactionTemplate(txManager).executeWithoutResult(s -> {
                events.publishEvent(new OrderEvents.Created(oid));
                events.publishEvent(new OrderEvents.StatusChanged(oid));
                events.publishEvent(new OrderEvents.PaymentReceived(oid, 100));
                events.publishEvent(new OrderEvents.Returned(oid, true, "товар x1", 100));
                events.publishEvent(new OrderEvents.Exchanged(oid, true, "товар"));
                events.publishEvent(new OrderEvents.CancelRequested(oid));
                events.publishEvent(new OrderEvents.CancelRequestResolved(oid, true));
                events.publishEvent(new OrderEvents.ChatMessage(oid, true, "привіт", "TEXT", "привіт", null, null));
                events.publishEvent(new OrderEvents.ChatMessage(oid, false, "привіт", "TEXT", "привіт", null, null));
                for (OrderEvents.EditKind kind : OrderEvents.EditKind.values()) {
                    events.publishEvent(new OrderEvents.Edited(oid, kind, true, "Товар", "Розмір", 1));
                }
            });
        }
        assertThat(telegram.calls).as("the listeners really reached the (fake) Telegram").isNotEmpty();
        assertNoLazyFailures();
    }

    /** Mini App initData signed the way Telegram does it, with the fake bot token of this test. */
    private String signedInitData() throws Exception {
        String user = "{\"id\":" + OTHER_TG + ",\"first_name\":\"Login\",\"username\":\"it_login\",\"language_code\":\"uk\"}";
        String authDate = String.valueOf(System.currentTimeMillis() / 1000);
        String check = "auth_date=" + authDate + "\nuser=" + user;
        byte[] secret = hmac("WebAppData".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                "123456:IT-FAKE-TOKEN".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte x : hmac(secret, check.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            hex.append(String.format("%02x", x));
        }
        return "auth_date=" + authDate + "&user=" + java.net.URLEncoder.encode(user, java.nio.charset.StandardCharsets.UTF_8)
                + "&hash=" + hex;
    }

    private static byte[] hmac(byte[] key, byte[] data) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    // ================================================================== seed

    private void doSeed() {
        TransactionTemplate tx = new TransactionTemplate(txManager);
        settings.update(Map.of(SettingsRegistry.REVIEWS_PREMODERATION, false, SettingsRegistry.PREORDER_ANY_PRODUCT, true,
                SettingsRegistry.ANTIBOT_ORDER_COOLDOWN_SEC, 0, SettingsRegistry.SUPPORT_COOLDOWN_SEC, 0));

        User u = new User();
        u.setTelegramUserId(TG);
        u.setUsername("it_customer");
        u.setFirstName("IT");
        u.setLastName("Покупець");
        u.setLanguageCode("uk");
        u.setLocale("uk");
        users.save(u);
        token = jwt.issueToken(TG, Role.CUSTOMER);

        PaymentOption po = new PaymentOption();
        po.setTitle("IT: оплата онлайн");
        po.setSortOrder(0);
        paymentOptionId = UuidUtil.toString(paymentOptions.save(po).getId());

        // catalog: category tree, brand, characteristics
        Category root = new Category();
        root.setName("IT Миші");
        root.setSlug("it-mice-" + UUID.randomUUID().toString().substring(0, 8));
        root = categories.save(root);
        Category child = new Category();
        child.setParentId(root.getId());
        child.setName("IT Ігрові миші");
        child.setSlug("it-gaming-" + UUID.randomUUID().toString().substring(0, 8));
        child.setH1("Ігрові миші");
        child.setIntroText("Вступ");
        child = categories.save(child);
        categorySlug = child.getSlug();
        Brand brand = new Brand();
        brand.setName("ITBrand " + UUID.randomUUID().toString().substring(0, 6));
        brand.setSlug("itbrand-" + UUID.randomUUID().toString().substring(0, 8));
        brand = brands.save(brand);
        SpecGroup group = new SpecGroup();
        group.setKey("it_main");
        group.setLabelRu("Основное");
        group.setLabelUk("Основне");
        group.setLabelEn("Main");
        if (!specGroups.existsById(group.getKey())) {
            specGroups.save(group);
        }
        SpecAttribute weight = new SpecAttribute();
        weight.setCategoryId(child.getId());
        weight.setKey("it_weight");
        weight.setGroupKey("it_main");
        weight.setLabelRu("Вес");
        weight.setLabelUk("Вага");
        weight.setLabelEn("Weight");
        weight.setType(SpecType.NUMBER);
        weight.setFilterable(true);
        weight.setComparable(true);
        specAttributes.save(weight);
        SpecAttribute conn = new SpecAttribute();
        conn.setCategoryId(child.getId());
        conn.setKey("it_conn");
        conn.setGroupKey("it_main");
        conn.setLabelRu("Подключение");
        conn.setLabelUk("Підключення");
        conn.setLabelEn("Connection");
        conn.setType(SpecType.ENUM);
        conn.setFilterable(true);
        conn = specAttributes.save(conn);
        SpecOption wireless = new SpecOption();
        wireless.setAttributeId(conn.getId());
        wireless.setValue("wireless");
        wireless.setLabelRu("Беспроводная");
        wireless.setLabelUk("Бездротова");
        wireless.setLabelEn("Wireless");
        specOptions.save(wireless);

        Product a = new Product();
        a.setTitle("IT Мишка з розмірами " + UUID.randomUUID().toString().substring(0, 6));
        a.setSlug("it-a-" + UUID.randomUUID());
        a.setDescription("Опис мишки");
        a.setPriceMinor(50_000);
        a.setCompareAtMinor(60_000L);
        a.setCategoryId(child.getId());
        a.setBrandId(brand.getId());
        a.setSpecsJson("{\"it_weight\":63,\"it_conn\":\"wireless\"}");
        a.setCardMetaJson("{\"bullets\":[\"раз\",\"два\"]}");
        for (int i = 0; i < 3; i++) {
            ProductImage img = new ProductImage();
            img.setProduct(a);
            img.setUrl("products/it-a-" + i + ".jpg");
            img.setSortOrder(i);
            a.getImages().add(img);
        }
        for (String name : List.of("S", "M", "L")) {
            ProductVariant v = new ProductVariant();
            v.setProduct(a);
            v.setName(name);
            v.setSortOrder(a.getVariants().size());
            a.getVariants().add(v);
        }
        Product savedA = products.save(a);
        for (ProductVariant v : savedA.getVariants()) {
            lots.sync(savedA.getId(), v.getId(), 20);
            jdbc.update("UPDATE product_variants SET stock = 20 WHERE id = ?", v.getId());
        }
        jdbc.update("UPDATE products SET stock = 60 WHERE id = ?", savedA.getId());
        productA = UuidUtil.toString(savedA.getId());
        productAItemSlug = savedA.getSlug();
        productAVariant = UuidUtil.toString(savedA.getVariants().get(0).getId());
        productAVariantB = UuidUtil.toString(savedA.getVariants().get(1).getId());

        productB = simpleProduct("IT Килимок", 20_000, 30, ProductCondition.NEW);
        simpleProduct("IT Уцінка", 15_000, 5, ProductCondition.USED);
        String giftProduct = simpleProduct("IT Подарунок", 1_000, 50, ProductCondition.NEW);
        productSoldOut = simpleProduct("IT Немає в наявності", 70_000, 0, ProductCondition.NEW);

        PromoCode promo = new PromoCode();
        promo.setCode("" + PROMO + "");
        promo.setDiscountPercent(10);
        promo.setActive(true);
        promoCodes.save(promo);

        // orders in every status
        Order newUnpaid = place(productB, null, 1);
        orders.put("newUnpaid", UuidUtil.toString(newUnpaid.getId()));
        orders.put("newUnpaidToCancel", UuidUtil.toString(place(productB, null, 1).getId()));

        Order paidToRequest = place(productB, null, 1);
        payments.markPaid(paidToRequest.getId(), 20_000);
        orders.put("paidToCancelRequest", UuidUtil.toString(paidToRequest.getId()));

        Order gifted = place(productA, productAVariant, 2);
        gifted = editing.applyDiscount(gifted.getId(), null, 500L, null, true, true);
        gifted = editing.addItem(gifted.getId(), giftProduct, null, 1, true, true);
        payments.markPaid(gifted.getId(), 99_500);
        lifecycle.approve(gifted.getId());
        orders.put("approvedPaidGift", UuidUtil.toString(gifted.getId()));

        Order shipped = place(productA, productAVariantB, 1);
        payments.markPaid(shipped.getId(), 50_000);
        lifecycle.approve(shipped.getId());
        lifecycle.ship(shipped.getId(), "20450000000001");
        orders.put("shipped", UuidUtil.toString(shipped.getId()));

        Order delivered = place(productA, productAVariant, 2);
        payments.markPaid(delivered.getId(), 100_000);
        lifecycle.approve(delivered.getId());
        lifecycle.ship(delivered.getId(), "20450000000002");
        lifecycle.deliver(delivered.getId());
        long itemId = jdbc.queryForObject("SELECT MIN(id) FROM order_items WHERE order_id = ?", Long.class, delivered.getId());
        returns.registerPlan(delivered.getId(), new ReturnPlan(
                List.of(new WizardLine(itemId, 1, LineOutcome.RESTOCK)),
                List.of(new ManualRefund(OrderMoneyMovement.Channel.CASH, 50_000, null)), 0, 0, null, false), "it");
        orders.put("deliveredWithReturn", UuidUtil.toString(delivered.getId()));

        Order rejected = place(productB, null, 1);
        lifecycle.reject(rejected.getId(), "немає в наявності", true);
        orders.put("rejected", UuidUtil.toString(rejected.getId()));

        // gift cases: the BRONZE tier of the migration starts at 1 500 UAH; prizes = a plain product, a product with
        // sizes and a discount
        settings.update(Map.of(SettingsRegistry.GIFT_ENABLED, true, SettingsRegistry.GIFT_CASE_ENABLED, true));
        jdbc.update("DELETE FROM gift_case_items WHERE tier = 'BRONZE'");
        jdbc.update("INSERT INTO gift_case_items (tier, kind, product_id, rarity, weight, sort_order) VALUES ('BRONZE','PRODUCT',?,'COMMON',50,1)",
                UuidUtil.toBytes(giftProduct));
        jdbc.update("INSERT INTO gift_case_items (tier, kind, product_id, rarity, weight, sort_order) VALUES ('BRONZE','PRODUCT',?,'RARE',30,2)",
                UuidUtil.toBytes(productA));
        jdbc.update("INSERT INTO gift_case_items (tier, kind, discount_percent, rarity, weight, sort_order) VALUES ('BRONZE','DISCOUNT',5,'COMMON',20,3)");
        String caseProduct = simpleProduct("IT Для кейсу", 20_000, 100, ProductCondition.NEW);
        for (int i = 0; i < 4; i++) {
            Order c = place(caseProduct, null, 8);
            payments.markPaid(c.getId(), c.getTotalMinor());
            giftCaseOrders.add(UuidUtil.toString(c.getId()));
        }

        // a support thread with an admin answer
        supportThread = support.create(TG, SupportService.SOURCE_MINIAPP,
                new com.maxsolch.shop.support.app.SupportDtos.CreateThreadRequest(
                        productA, null, "Яка вага?", null, null, null, null)).id();
        support.sendAsAdmin(supportThread, 1L, "Менеджер", new SendMessageRequest(
                "63 грами", null, null, null, null, null));
    }

    private String freshCustomerToken() {
        long id = 7_100_000_000L + ThreadLocalRandom.current().nextLong(900_000_000L);
        User u = new User();
        u.setTelegramUserId(id);
        u.setFirstName("Fresh");
        u.setLanguageCode("uk");
        users.save(u);
        return jwt.issueToken(id, Role.CUSTOMER);
    }

    private String simpleProduct(String title, long price, int stock, ProductCondition condition) {
        Product p = new Product();
        p.setTitle(title + " " + UUID.randomUUID().toString().substring(0, 6));
        p.setSlug("it-" + UUID.randomUUID());
        p.setPriceMinor(price);
        p.setCondition(condition);
        ProductImage img = new ProductImage();
        img.setProduct(p);
        img.setUrl("products/" + p.getSlug() + ".jpg");
        p.getImages().add(img);
        Product saved = products.save(p);
        if (stock > 0) {
            lots.sync(saved.getId(), null, stock);
        }
        jdbc.update("UPDATE products SET stock = ? WHERE id = ?", stock, saved.getId());
        return UuidUtil.toString(saved.getId());
    }

    private Order place(String productId, String variantId, int qty) {
        return checkout.createOrder(new CreateOrderCommand(TG, TG, "it_customer",
                List.of(new CreateOrderCommand.Line(productId, variantId, qty)),
                "IT Покупець", "+38067" + (1000000 + ThreadLocalRandom.current().nextInt(8999999)),
                null, null, "PICKUP", null, null, null, null, paymentOptionId));
    }

    // ================================================================== http helpers

    private MockHttpServletResponse get(String url, String bearer, String lang) throws Exception {
        return send(MockMvcRequestBuilders.get(url), bearer, lang, null, Map.of());
    }

    private MockHttpServletResponse delete(String url, String bearer, String lang) throws Exception {
        return send(MockMvcRequestBuilders.delete(url), bearer, lang, null, Map.of());
    }

    private MockHttpServletResponse post(String url, String bearer, String lang, String body) throws Exception {
        return send(MockMvcRequestBuilders.post(url), bearer, lang, body, Map.of());
    }

    private MockHttpServletResponse post(String url, String bearer, String lang, String body, Map<String, String> headers)
            throws Exception {
        return send(MockMvcRequestBuilders.post(url), bearer, lang, body, headers);
    }

    private MockHttpServletResponse put(String url, String bearer, String lang, String body) throws Exception {
        return send(MockMvcRequestBuilders.put(url), bearer, lang, body, Map.of());
    }

    private MockHttpServletResponse send(MockHttpServletRequestBuilder rb, String bearer, String lang, String body,
                                         Map<String, String> headers) throws Exception {
        rb.header("Accept-Language", lang);
        // each request is its own "visitor": the per-IP limiters must not turn a long walk into 429s
        rb.with(r -> {
            r.setRemoteAddr("10." + ThreadLocalRandom.current().nextInt(250) + "." + ThreadLocalRandom.current().nextInt(250)
                    + "." + (1 + ThreadLocalRandom.current().nextInt(250)));
            return r;
        });
        if (bearer != null) {
            rb.header("Authorization", "Bearer " + bearer);
        }
        headers.forEach(rb::header);
        if (body != null) {
            rb.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        MockHttpServletResponse res = mvc.perform(rb).andReturn().getResponse();
        res.setCharacterEncoding("UTF-8");
        covered.add(rb.buildRequest(new org.springframework.mock.web.MockServletContext()).getMethod() + " "
                + rb.buildRequest(new org.springframework.mock.web.MockServletContext()).getRequestURI()
                + " -> " + res.getStatus());
        return res;
    }

    private static void ok(MockHttpServletResponse r) throws Exception {
        assertThat(r.getStatus()).as(label(r)).isBetween(200, 299);
        assertThat(r.getContentAsString()).as(label(r)).doesNotContain("\"status\":500").doesNotContain("LazyInitialization");
    }

    private static void notServerError(MockHttpServletResponse r) throws Exception {
        assertThat(r.getStatus()).as(label(r)).isLessThan(500);
        assertThat(r.getContentAsString()).as(label(r)).doesNotContain("LazyInitialization");
    }

    private static String label(MockHttpServletResponse r) {
        try {
            return "status " + r.getStatus() + " body: " + r.getContentAsString();
        } catch (Exception e) {
            return "status " + r.getStatus();
        }
    }

    // ================================================================== log check

    private static final List<String> LAZY_MARKERS = List.of("LazyInitializationException", "could not initialize proxy",
            "failed to lazily initialize", "Cannot lazily initialize", "no Session");

    private void assertNoLazyFailures() {
        List<String> found = new ArrayList<>();
        for (ILoggingEvent e : new ArrayList<>(logs.list)) {
            StringBuilder text = new StringBuilder(String.valueOf(e.getFormattedMessage()));
            for (IThrowableProxy t = e.getThrowableProxy(); t != null; t = t.getCause()) {
                text.append(' ').append(t.getClassName()).append(' ').append(t.getMessage());
            }
            String s = text.toString();
            if (LAZY_MARKERS.stream().anyMatch(s::contains)) {
                found.add(e.getLoggerName() + ": " + s);
            }
        }
        assertThat(found).as("lazy-loading failures in the log (listeners swallow them)").isEmpty();
    }
}
