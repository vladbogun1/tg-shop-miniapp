package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.GiftCaseRules;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.returns.domain.OrderExchange;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.returns.app.ReturnRecords;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.inventory.domain.StockWriteoff;
import com.maxsolch.shop.gift.GiftCaseService;
import com.maxsolch.shop.gift.GiftDtos;
import com.maxsolch.shop.platform.i18n.CustomerRejectReason;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import com.maxsolch.shop.order.infra.OrderMessageRepository;
import com.maxsolch.shop.order.infra.OrderMoneyMovementRepository;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.repository.ProductImageRepository;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.order.app.OrderCardDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Characterization test (golden files) of every order DTO built by {@link OrderQueryService}: customer
 * detail, admin detail, card, summary, dispatch row. The JSON the apps receive must not change by a
 * byte — the files in {@code src/test/resources/golden/order} were written from the code before the
 * DTO refactoring. A missing file is written on the first run; {@code -Dgolden.update=true} rewrites all.
 */
class OrderQueryServiceGoldenTest {

    private static final Path GOLDEN_DIR = Path.of("src/test/resources/golden/order");

    private final Map<String, List<PaymentInvoice>> invoices = new HashMap<>();
    private final Map<String, List<OrderExchange>> exchanges = new HashMap<>();
    private final Map<String, List<OrderMoneyMovement>> movements = new HashMap<>();
    private final Map<String, List<StockWriteoff>> writeoffs = new HashMap<>();
    private final Map<String, List<OrderReturn>> returns = new HashMap<>();
    private final Map<Long, List<OrderReturnLine>> returnLines = new HashMap<>();
    private final Map<String, List<Object[]>> exchangeChildren = new HashMap<>();
    private final Map<String, List<Object[]>> mergedChildren = new HashMap<>();
    private final Map<String, Order> ordersById = new HashMap<>();
    private final Map<String, String> thumbs = new HashMap<>();

    private OrderQueryService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderMessageRepository messages = mock(OrderMessageRepository.class);
        OrderItemRepository items = mock(OrderItemRepository.class);
        PaymentInvoiceRepository invoiceRepo = mock(PaymentInvoiceRepository.class);
        MonobankGateway mono = mock(MonobankGateway.class);
        ProductImageRepository images = mock(ProductImageRepository.class);
        TranslationService translation = mock(TranslationService.class);
        UserRepository users = mock(UserRepository.class);
        CustomerRejectReason rejectReason = mock(CustomerRejectReason.class);
        OrderExchangeRepository exchangeRepo = mock(OrderExchangeRepository.class);
        OrderMoneyMovementRepository movementRepo = mock(OrderMoneyMovementRepository.class);
        StockWriteoffRepository writeoffRepo = mock(StockWriteoffRepository.class);
        OrderReturnRepository returnRepo = mock(OrderReturnRepository.class);
        OrderReturnLineRepository returnLineRepo = mock(OrderReturnLineRepository.class);
        OrderLookup lookup = mock(OrderLookup.class);
        GiftCaseService gifts = mock(GiftCaseService.class);

        when(mono.isEnabled()).thenReturn(true);
        when(users.localeOf(anyLong())).thenReturn(Optional.of("uk"));
        when(rejectReason.current(any())).thenAnswer(inv -> inv.getArgument(0) == null ? null : "[cur] " + inv.getArgument(0));
        when(invoiceRepo.findByOrderIdOrderByCreatedAtDesc(any()))
                .thenAnswer(inv -> invoices.getOrDefault(key(inv.getArgument(0)), List.of()));
        when(exchangeRepo.findByOrderIdOrderByCreatedAtAsc(any()))
                .thenAnswer(inv -> exchanges.getOrDefault(key(inv.getArgument(0)), List.of()));
        when(exchangeRepo.findById(anyLong())).thenAnswer(inv -> exchanges.values().stream().flatMap(List::stream)
                .filter(e -> e.getId().equals(inv.getArgument(0))).findFirst());
        when(movementRepo.findByOrderIdOrderByOccurredAtAscIdAsc(any()))
                .thenAnswer(inv -> movements.getOrDefault(key(inv.getArgument(0)), List.of()));
        when(writeoffRepo.findByOrderIdOrderByCreatedAtAsc(any()))
                .thenAnswer(inv -> writeoffs.getOrDefault(key(inv.getArgument(0)), List.of()));
        when(orders.exchangeChildren(any())).thenAnswer(inv -> rowsFor(exchangeChildren, inv.getArgument(0)));
        when(orders.mergedChildren(any())).thenAnswer(inv -> rowsFor(mergedChildren, inv.getArgument(0)));
        when(orders.findById(any(byte[].class)))
                .thenAnswer(inv -> Optional.ofNullable(ordersById.get(key(inv.getArgument(0)))));
        when(images.findForProducts(anyList())).thenAnswer(inv -> {
            List<ProductImage> out = new ArrayList<>();
            for (byte[] pid : inv.<List<byte[]>>getArgument(0)) {
                String p = UuidUtil.toString(pid);
                if (thumbs.containsKey(p)) {
                    Product product = new Product();
                    product.setId(pid);
                    ProductImage img = new ProductImage();
                    img.setProduct(product);
                    img.setUrl(thumbs.get(p));
                    out.add(img);
                }
            }
            return out;
        });
        // uk/en: the line titles and the payment title are «translated», the rest stays as is.
        when(translation.orderItemNames(any(), any(), anyString())).thenAnswer(inv -> {
            Map<String, String> titles = new HashMap<>();
            for (byte[] pid : inv.<java.util.Collection<byte[]>>getArgument(0)) {
                titles.put(UuidUtil.toString(pid), "Translated title " + UuidUtil.toString(pid).substring(30));
            }
            return new TranslationService.ItemNames(titles, Map.of());
        });
        TranslationService.Overlay overlay = mock(TranslationService.Overlay.class);
        when(overlay.text(any(), any(), any(), any())).thenAnswer(inv -> "[tr] " + inv.getArgument(3));
        when(translation.overlay(anyString())).thenReturn(overlay);
        when(returnRepo.findByOrderIdOrderByIdAsc(any()))
                .thenAnswer(inv -> returns.getOrDefault(key(inv.getArgument(0)), List.of()));
        when(lookup.find(any())).thenAnswer(inv -> Optional.ofNullable(ordersById.get(key(inv.getArgument(0)))));
        when(returnLineRepo.findByReturnIdInOrderByIdAsc(anyList())).thenAnswer(inv -> {
            List<OrderReturnLine> out = new ArrayList<>();
            for (Long id : inv.<List<Long>>getArgument(0)) {
                out.addAll(returnLines.getOrDefault(id, List.of()));
            }
            return out;
        });
        when(gifts.orderGift(any(), anyString(), anyBoolean())).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            if (o.getGiftTier() == null && o.getGiftCaseStatus() == null) {
                return null;
            }
            boolean customer = inv.getArgument(2);
            String lang = inv.getArgument(1);
            return new GiftDtos.OrderGiftDto(o.getGiftTier(), o.getGiftDiscountMinor(), o.getGiftCaseStatus(),
                    GiftCaseRules.giftCaseOpenable(o),
                    customer ? null : new GiftDtos.CaseItemDto("k1", "PRODUCT", "p-" + lang, "Prize",
                            "https://img/prize.jpg", 25000, "RARE", 0, 0),
                    new GiftDtos.PromoDto("GIFT-AB12", 10, 0, Instant.parse("2026-12-01T00:00:00Z"), false),
                    new GiftDtos.SwapDto(true, 15000, null),
                    new GiftDtos.SizeDto(false, true, "v1", "M", List.of(new GiftDtos.SizeOption("v1", "M"))),
                    customer ? null : Boolean.TRUE);
        });

        @SuppressWarnings("unchecked")
        org.springframework.beans.factory.ObjectProvider<com.maxsolch.shop.gift.GiftCaseService> giftProvider =
                mock(org.springframework.beans.factory.ObjectProvider.class);
        when(giftProvider.getIfAvailable()).thenReturn(gifts);
        service = new OrderQueryService(orders, messages, items,
                new com.maxsolch.shop.payment.app.OrderPaymentsAdapter(
                        mock(com.maxsolch.shop.payment.app.OnlinePaymentService.class), invoiceRepo, mono,
                        java.time.Clock.systemUTC()),
                images, translation, users,
                rejectReason,
                new ReturnRecords(returnRepo, returnLineRepo, exchangeRepo, lookup),
                movementRepo, writeoffRepo, giftProvider);

        AtomicReference<ObjectMapper> ref = new AtomicReference<>();
        // The ObjectMapper of the application: Spring Boot's own JacksonAutoConfiguration (no custom config in config/).
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class))
                .run(ctx -> ref.set(ctx.getBean(ObjectMapper.class)));
        mapper = ref.get();
    }

    /** «Объединить» (V71): the window rows, one mergeable order and one with a blocker. */
    @Test
    void mergeCandidates() throws IOException {
        Order free = baseOrder(4, OrderStatus.NEW);
        free.setPaid(true);
        free.setReceivedMinor(50000);
        free.setPrepaymentMinor(20000);
        free.setTotalMinor(50000);
        free.setTrackingNumber("20450000555666");
        free.setGiftCaseStatus("SEALED");
        free.setPaymentOptionTitle("Оплата картой онлайн");
        item(free, 41, "Мышь Lamzu Atlantis", "Чёрная", 50000, 1);
        Order blocked = baseOrder(5, OrderStatus.APPROVED);
        blocked.setReceivedMinor(-5);
        blocked.setTotalMinor(30000);
        OrderItem gift = item(blocked, 51, "Коврик", null, 0, 2);
        gift.setGift(true);
        List<OrderMerge.Candidate> found = List.of(
                new OrderMerge.Candidate(free, null, 80000, 50000, 10000, 20000),
                new OrderMerge.Candidate(blocked, "Заказ уже отправлен", 30000, 0, 0, 30000));

        compareWithGolden("merge-candidates", service.mergeCandidates(found));
    }

    @Test
    void paidShippedOrder() throws IOException {
        Order o = baseOrder(1, OrderStatus.SHIPPED);
        o.setPaid(true);
        o.setPaidAt(Instant.parse("2026-10-02T10:05:00Z"));
        o.setReceivedMinor(150000);
        o.setPrepaymentMinor(0);
        o.setTrackingNumber("20450000111222");
        o.setComment("Позвоните перед доставкой");
        o.setPaymentOptionId(id(91));
        o.setPaymentOptionTitle("Оплата картой онлайн");
        o.setNpCityRef("city-ref-1");
        o.setNpWarehouseRef("wh-ref-1");
        OrderItem a = item(o, 11, "Мышь Lamzu Atlantis", "Чёрная", 100000, 1);
        OrderItem b = item(o, 12, "Коврик Artisan", null, 50000, 1);
        o.setSubtotalMinor(150000);
        o.setTotalMinor(150000);
        thumbs.put(UuidUtil.toString(a.getProductId()), "https://img/p11.jpg");
        thumbs.put(UuidUtil.toString(b.getProductId()), "https://img/p12.jpg");
        invoices.put(key(o.getId()), List.of(invoice(o, "success", 150000, Instant.parse("2026-10-02T10:05:00Z"))));
        movements.put(key(o.getId()), List.of(movement(1, o, "RECEIVED", "MONOBANK", 150000)));

        verifyGolden("paid-shipped", o, "uk", "ru", "en");
    }

    @Test
    void novaPoshtaCodPartialPickup() throws IOException {
        Order o = baseOrder(2, OrderStatus.DELIVERED);
        o.setPaid(false);
        o.setPrepaymentMinor(20000);
        o.setReceivedMinor(20000);
        o.setPaymentDueAt(Instant.parse("2026-10-03T10:00:00Z"));
        o.setUncollectedMinor(30000);
        o.setDeliveredAt(Instant.parse("2026-10-06T09:00:00Z"));
        o.setReturnStatus(Order.RETURN_IN_TRANSIT);
        o.setReturnedAt(Instant.parse("2026-10-07T08:00:00Z"));
        o.setRefundedMinor(0);
        o.setTrackingNumber("20450000333444");
        o.setPaymentOptionTitle("Наложенный платёж (предоплата 200 ₴)");
        OrderItem a = item(o, 21, "Клавиатура Wooting", "60HE", 70000, 1);
        OrderItem b = item(o, 22, "Свитчи Gateron", null, 15000, 2);
        b.setReturnedQty(1);
        b.setReturnPendingQty(1);
        o.setSubtotalMinor(100000);
        o.setTotalMinor(100000);
        thumbs.put(UuidUtil.toString(a.getProductId()), "https://img/p21.jpg");
        invoices.put(key(o.getId()), List.of(invoice(o, "success", 20000, Instant.parse("2026-10-02T10:05:00Z"))));

        verifyGolden("np-cod-partial-pickup", o, "uk");
    }

    @Test
    void returnAndExchange() throws IOException {
        Order o = baseOrder(3, OrderStatus.DELIVERED);
        o.setPaid(true);
        o.setPaidAt(Instant.parse("2026-10-02T10:05:00Z"));
        o.setReceivedMinor(220000);
        o.setRefundedMinor(40000);
        o.setReturnedAt(Instant.parse("2026-10-09T12:00:00Z"));
        o.setExchangeOfOrderId(id(30));
        o.setMergedIntoOrderId(id(31));
        o.setArchivedAt(Instant.parse("2026-10-20T12:00:00Z"));
        o.setArchivedBy("claude-tech");
        o.setArchiveReason("Закрыт");
        o.setReturnStatus("RECEIVED");
        o.setReturnReceivedAt(Instant.parse("2026-10-12T12:00:00Z"));
        OrderItem a = item(o, 33, "Наушники Arctis", "Белые", 120000, 1);
        a.setId(301L);
        a.setReturnedQty(1);
        OrderItem b = item(o, 34, "Подставка", null, 100000, 1);
        b.setId(302L);
        o.setSubtotalMinor(220000);
        o.setTotalMinor(220000);
        thumbs.put(UuidUtil.toString(a.getProductId()), "https://img/p33.jpg");

        OrderExchange ex = new OrderExchange();
        ex.setId(77L);
        ex.setOrderId(o.getId());
        ex.setCreatedAt(Instant.parse("2026-10-08T12:00:00Z"));
        ex.setPreviousStatus("DELIVERED");
        ex.setPreviousTracking("20450000555666");
        ex.setReturnedSummary("Наушники ×1");
        ex.setGivenSummary("Наушники другие ×1");
        ex.setTotalBeforeMinor(240000);
        ex.setTotalAfterMinor(220000);
        ex.setNote("Брак");
        ex.setAdminName("Админ");
        ex.setNewOrderId(id(35));
        exchanges.put(key(o.getId()), List.of(ex));
        Order replacement = baseOrder(35, OrderStatus.NEW);
        ordersById.put(key(replacement.getId()), replacement);

        OrderReturn r1 = ret(501L, o, "RETURN", null, 40000);
        OrderReturn r2 = ret(502L, o, "EXCHANGE", 77L, 0);
        returns.put(key(o.getId()), List.of(r1, r2));
        returnLines.put(501L, List.of(line(1L, 501L, 301L, 1, "RESTOCK", 1, 0)));
        returnLines.put(502L, List.of(line(2L, 502L, 301L, 1, "IN_TRANSIT", 0, 0),
                line(3L, 502L, 999L, 2, "DEFECT", 0, 2)));

        exchangeChildren.put(key(o.getId()), java.util.Collections.singletonList((Object[]) new byte[][]{o.getId(), id(36)}));
        mergedChildren.put(key(o.getId()), java.util.Collections.singletonList((Object[]) new byte[][]{o.getId(), id(37)}));
        movements.put(key(o.getId()), List.of(movement(1, o, "RECEIVED", "MONOBANK", 220000),
                movement(2, o, "REFUND", "MONOBANK", 40000), movement(3, o, "RETAINED", "CASH", 5000)));
        StockWriteoff w = new StockWriteoff();
        w.setId(9L);
        w.setTitle("Наушники Arctis");
        w.setQuantity(1);
        w.setUndoneQty(0);
        w.setUndoneNote(null);
        w.setReason("DEFECT");
        w.setUnitValueMinor(120000);
        w.setNote("Не включается");
        w.setAdminName("Админ");
        w.setCreatedAt(Instant.parse("2026-10-12T13:00:00Z"));
        writeoffs.put(key(o.getId()), List.of(w));
        invoices.put(key(o.getId()), List.of(invoice(o, "success", 220000, Instant.parse("2026-10-02T10:05:00Z"))));

        verifyGolden("return-exchange", o, "uk");
    }

    @Test
    void giftCasePromoAndRejectReason() throws IOException {
        Order o = baseOrder(4, OrderStatus.REJECTED);
        o.setSource(OrderSource.WEB);
        o.setPaid(false);
        o.setPrepaymentMinor(0);
        o.setReceivedMinor(0);
        o.setPaymentDueAt(Instant.parse("2026-10-03T10:00:00Z"));
        o.setPromoCode("LEVELUP10");
        o.setDiscountMinor(18000);
        o.setGiftDiscountMinor(5000);
        o.setGiftTier("SILVER");
        o.setGiftCaseStatus(GiftCaseRules.GIFT_CASE_SEALED);
        o.setRejectReason("Не оплачен в течение 24 ч");
        o.setRejectReasonCode("UNPAID");
        o.setRejectedAt(Instant.parse("2026-10-03T10:01:00Z"));
        o.setCancelRequestStatus("DECLINED");
        o.setCancelRequestReason("Передумал");
        o.setCancelRequestedAt(Instant.parse("2026-10-02T15:00:00Z"));
        o.setCancelRequestResolvedAt(Instant.parse("2026-10-02T16:00:00Z"));
        o.setCancelRequestAdminComment("Уже отправлен");
        o.setPaymentOptionId(id(92));
        o.setPaymentOptionTitle("Оплата картой онлайн");
        o.setDeliveryMethod(null);
        item(o, 41, "Мышь Lamzu Maya", "Белая", 200000, 1);
        OrderItem prize = item(o, 42, "Приз кейса", null, 0, 1);
        prize.setGift(true);
        prize.setAutoGift(true);
        prize.setCaseRarity("RARE");
        prize.setVariantPending(true);
        prize.setGiftValueMinor(25000);
        o.setSubtotalMinor(200000);
        o.setTotalMinor(182000);
        invoices.put(key(o.getId()), List.of(invoice(o, "created", 182000, Instant.parse("2099-01-01T00:00:00Z"))));

        verifyGolden("gift-promo-rejected", o, "uk", "en");
    }

    // ------------------------------------------------------------------ harness

    private void verifyGolden(String name, Order o, String... customerLangs) throws IOException {
        Map<String, Object> all = new LinkedHashMap<>();
        for (String lang : customerLangs) {
            all.put("customerDetail_" + lang, service.toDetail(o, lang));
        }
        all.put("adminDetail", service.toDetail(o));
        String id = UuidUtil.toString(o.getId());
        OrderCardDto.CardLine line = new OrderCardDto.CardLine("https://img/x.jpg", "Мышь · Чёрная", 2, 1, 1, false, 12345);
        OrderQueryService.CardContext ctx = new OrderQueryService.CardContext(Map.of(id, 3L), Map.of(id, 4),
                Map.of(id, List.of(line)), Map.of(id, List.of("child-1", "child-2")));
        all.put("card", service.toCard(o, ctx));
        all.put("summary", service.toSummary(o, ctx));
        all.put("dispatch", service.toDispatch(o));
        compareWithGolden(name, all);
    }

    private void compareWithGolden(String name, Object all) throws IOException {
        DefaultPrettyPrinter printer = new DefaultPrettyPrinter();
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        printer.indentObjectsWith(indenter);
        printer.indentArraysWith(indenter);
        String actual = mapper.writer(printer).writeValueAsString(all) + "\n";

        Path file = GOLDEN_DIR.resolve(name + ".json");
        if (!Files.exists(file) || Boolean.getBoolean("golden.update")) {
            Files.createDirectories(GOLDEN_DIR);
            Files.writeString(file, actual, StandardCharsets.UTF_8);
            System.out.println("golden written: " + file);
            return;
        }
        String expected = Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n");
        JsonNode expectedTree = mapper.readTree(expected);
        JsonNode actualTree = mapper.readTree(actual);
        assertThat(actualTree).as("JSON tree of %s", name).isEqualTo(expectedTree);
        // Same text means the same key order too: records serialize in component order, the apps do not
        // rely on it but the refactoring must not reorder them.
        assertThat(actual).as("key order / text of %s", name).isEqualTo(expected);
    }

    private static String key(Object id) {
        return UuidUtil.toString((byte[]) id);
    }

    private static List<Object[]> rowsFor(Map<String, List<Object[]>> source, java.util.Collection<byte[]> ids) {
        List<Object[]> out = new ArrayList<>();
        for (byte[] id : ids) {
            out.addAll(source.getOrDefault(key(id), List.of()));
        }
        return out;
    }

    private static byte[] id(int n) {
        return UuidUtil.toBytes(String.format("00000000-0000-4000-8000-%012d", n));
    }

    private Order baseOrder(int n, OrderStatus status) {
        Order o = new Order();
        o.setId(id(n));
        o.setUserId(7000L + n);
        OrderStates.withStatus(o, status);
        o.setSource(OrderSource.MINIAPP);
        o.setCurrency("UAH");
        o.setCustomerName("Иван Петренко " + n);
        o.setPhone("+38067123456" + n);
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityName("Харьков");
        o.setNpWarehouseName("Отделение №" + n);
        o.setTgUserId(1000L + n);
        o.setTgUsername("buyer" + n);
        o.setCreatedAt(Instant.parse("2026-10-02T10:00:00Z"));
        o.setApprovedAt(Instant.parse("2026-10-02T11:00:00Z"));
        o.setShippedAt(Instant.parse("2026-10-03T12:00:00Z"));
        o.setPaymentOptionTitle("Оплата");
        ordersById.put(key(o.getId()), o);
        return o;
    }

    private static OrderItem item(Order o, int productN, String title, String variant, long price, int qty) {
        OrderItem it = new OrderItem();
        it.setOrder(o);
        it.setProductId(id(productN));
        it.setVariantId(variant == null ? null : id(productN + 1000));
        it.setTitleSnapshot(title);
        it.setVariantNameSnapshot(variant);
        it.setPriceMinorSnapshot(price);
        it.setQuantity(qty);
        o.getItems().add(it);
        return it;
    }

    private static PaymentInvoice invoice(Order o, String status, long amount, Instant expiresAt) {
        PaymentInvoice i = new PaymentInvoice();
        i.setId(id(800));
        i.setOrderId(o.getId());
        i.setStatus(status);
        i.setAmountMinor(amount);
        i.setPageUrl("https://pay.example/invoice/abc");
        i.setExpiresAt(expiresAt);
        i.setMaskedPan("444403******1902");
        i.setPaymentMethod("pan");
        i.setFailureReason("success".equals(status) ? null : "Недостаточно средств");
        i.setAppliedAt("success".equals(status) ? Instant.parse("2026-10-02T10:05:00Z") : null);
        i.setRefundedMinor(0);
        return i;
    }

    private static OrderMoneyMovement movement(long n, Order o, String kind, String channel, long amount) {
        OrderMoneyMovement m = new OrderMoneyMovement();
        m.setId(n);
        m.setOrderId(o.getId());
        m.setKind(kind);
        m.setChannel(channel);
        m.setAmountMinor(amount);
        m.setOccurredAt(Instant.parse("2026-10-02T10:05:00Z").plusSeconds(n));
        m.setAdminName("Админ");
        m.setNote("note " + n);
        m.setInvoiceExtId("inv-" + n);
        m.setSource("ADMIN");
        return m;
    }

    private static OrderReturn ret(long n, Order o, String kind, Long exchangeId, long refund) {
        // The rule that decides the blocker has its own test (ReturnCancellationTest); the golden pins the mapping.
        OrderReturn r = new OrderReturn() {
            @Override
            public String cancelBlocker(Order replacement) {
                return getKind().equals("EXCHANGE") ? "Замена уже отправлена" : null;
            }
        };
        r.setId(n);
        r.setOrderId(o.getId());
        r.setKind(kind);
        r.setExchangeId(exchangeId);
        r.setRefundMinor(refund);
        r.setRefundChannel(refund > 0 ? "MONOBANK" : null);
        r.setMonoRefundMinor(refund);
        r.setNote("Возврат " + n);
        r.setAdminName("Админ");
        r.setCreatedAt(Instant.parse("2026-10-08T12:00:00Z").plusSeconds(n));
        r.setDebtMinor(1000);
        r.setDebtPaidAt(Instant.parse("2026-10-09T12:00:00Z"));
        return r;
    }

    private static OrderReturnLine line(long n, long returnId, long itemId, int qty, String outcome, int restocked, int defect) {
        OrderReturnLine l = new OrderReturnLine();
        l.setId(n);
        l.setReturnId(returnId);
        l.setItemId(itemId);
        l.setQuantity(qty);
        l.setOutcome(outcome);
        l.setRestockedQty(restocked);
        l.setDefectQty(defect);
        return l;
    }
}
