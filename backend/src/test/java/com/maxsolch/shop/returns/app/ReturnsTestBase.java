package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.MoneyLedger;
import com.maxsolch.shop.order.app.OrderApp;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.inventory.infra.StockWriteoffRepository;
import com.maxsolch.shop.returns.domain.ManualRefund;
import com.maxsolch.shop.returns.domain.ReturnPlan;
import com.maxsolch.shop.returns.domain.WizardLine;
import com.maxsolch.shop.returns.infra.OrderExchangeLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import com.maxsolch.shop.order.app.OrderStock;
import com.maxsolch.shop.order.app.StockFixtures;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/** The mocks and order / product builders the returns scenario tests share. */
@ExtendWith(MockitoExtension.class)
abstract class ReturnsTestBase {

    @Mock
    OrderRepository orderRepository;

    @Mock
    ProductRepository productRepository;

    @Mock
    PromoCodeRepository promoCodeRepository;

    @Mock
    PaymentOptionRepository paymentOptionRepository;


    @Mock
    ApplicationEventPublisher events;

    @Mock
    PromoService promoService;

    @Mock
    CartService cartService;

    @Mock
    com.maxsolch.shop.platform.i18n.Messages messages;

    @Mock
    jakarta.persistence.EntityManager entityManager;

    @Mock
    com.maxsolch.shop.returns.infra.OrderExchangeRepository exchangeRepository;

    @Mock
    StockWriteoffRepository writeoffs;
    @Mock
    OrderReturnRepository recRepo;
    @Mock
    OrderReturnLineRepository lineRepo;
    @Mock
    OrderExchangeLineRepository exchangeLineRepo;

    /** The money journal behind the scenarios under test (a mock that records nothing unless a test verifies it). */
    MoneyLedger ledgerMock;
    DefectWriteoffs defects;
    Returns returns;
    ReturnReceiving receiving;
    Exchanges exchanges;
    ReturnCancellation cancellation;

    @BeforeEach
    void setUpReturns() {
        ledgerMock = Mockito.mock(MoneyLedger.class);
        OrderStock stock = StockFixtures.stock(productRepository, messages);
        OrderApp app = OrderApp.create(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, events,
                promoService, cartService, messages, entityManager, stock, Mockito.mock(MoneyLedger.class));
        ReturnsApp returnsApp = ReturnsApp.create(app, orderRepository, stock, StockFixtures.shelf(productRepository, messages), events, ledgerMock, exchangeRepository,
                writeoffs, recRepo, lineRepo, exchangeLineRepo);
        defects = returnsApp.defects;
        returns = returnsApp.returns;
        receiving = returnsApp.receiving;
        exchanges = returnsApp.exchanges;
        cancellation = returnsApp.cancellation;
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, status);
        o.setCustomerName("Іван Петренко");
        o.setPhone("+380501112233");
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityRef("city-1");
        o.setNpCityName("Київ");
        o.setNpWarehouseRef("wh-1");
        o.setNpWarehouseName("Відділення №1");
        o.setItems(new ArrayList<>());
        o.setTotalMinor(30_000);
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    Product product(int stock) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Мишка");
        p.setStock(stock);
        p.setVariants(new ArrayList<>());
        return p;
    }

    OrderItem item(Order o, Product p, long id, int qty) {
        OrderItem it = new OrderItem();
        it.setId(id);
        it.setOrder(o);
        it.setProductId(p.getId());
        it.setTitleSnapshot(p.getTitle());
        it.setQuantity(qty);
        it.setPriceMinorSnapshot(10_000);
        o.getItems().add(it);
        return it;
    }

    /** Saved orders get an id like @PrePersist would, and are found again by findByIdForUpdate. */
    List<Order> trackOrders(Order original) {
        List<Order> all = new ArrayList<>(List.of(original));
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order x = inv.getArgument(0);
            if (x.getId() == null) {
                x.setId(UuidUtil.randomBytes());
            }
            if (all.stream().noneMatch(y -> y == x)) {
                all.add(x);
            }
            return x;
        });
        lenient().when(orderRepository.findByIdForUpdate(any())).thenAnswer(inv -> all.stream()
                .filter(y -> java.util.Arrays.equals(y.getId(), inv.getArgument(0)))
                .findFirst());
        com.maxsolch.shop.payment.domain.PaymentOption po = new com.maxsolch.shop.payment.domain.PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle("Наложений платіж");
        lenient().when(paymentOptionRepository.findById(any())).thenReturn(Optional.of(po));
        lenient().when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(po));
        return all;
    }

    MoneyLedger wireLedger() {
        return ledgerMock;
    }

    static ReturnPlan plan(List<WizardLine> lines,
                                                          List<ManualRefund> refunds,
                                                          long retain, long mono) {
        return new ReturnPlan(lines, refunds, retain, mono, null, false);
    }

    /** In-memory return records: ids assigned on save, lookups the service uses. */
    List<com.maxsolch.shop.returns.domain.OrderReturnLine> wireReturnRecords(List<com.maxsolch.shop.returns.domain.OrderReturn> recs) {
        List<com.maxsolch.shop.returns.domain.OrderReturnLine> lines = new ArrayList<>();
        lenient().when(recRepo.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.returns.domain.OrderReturn r = inv.getArgument(0);
            if (r.getId() == null) {
                r.setId((long) recs.size() + 1);
                recs.add(r);
            }
            return r;
        });
        lenient().when(recRepo.findByOrderIdOrderByIdAsc(any())).thenAnswer(inv -> new ArrayList<>(recs));
        lenient().when(lineRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<com.maxsolch.shop.returns.domain.OrderReturnLine> it = inv.getArgument(0);
            it.forEach(l -> {
                if (l.getId() == null) {
                    l.setId((long) lines.size() + 1);
                    lines.add(l);
                }
            });
            return inv.getArgument(0);
        });
        lenient().when(lineRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(lineRepo.findByReturnIdInOrderByIdAsc(any())).thenAnswer(inv -> {
            java.util.Collection<Long> ids = inv.getArgument(0);
            return lines.stream().filter(l -> ids.contains(l.getReturnId())).toList();
        });
        lenient().when(lineRepo.findByWriteoffId(any())).thenAnswer(inv ->
                lines.stream().filter(l -> inv.getArgument(0).equals(l.getWriteoffId())).toList());
        return lines;
    }

    /** An exchange of 1 of 2 mice (paid 200 ₴) for a keyboard of 150 ₴: the credit of 100 ₴ moves to the new order. */
    Order deliveredOrderForExchange(Product mouse) {
        Order o = order(OrderStatus.DELIVERED);
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(20_000);
        o.setPaid(true);
        o.setUserId(77L);
        item(o, mouse, 1L, 2);
        o.setSubtotalMinor(20_000);
        o.setTotalMinor(20_000);
        return o;
    }

    void wireExchanges() {
        com.maxsolch.shop.returns.domain.OrderExchange[] saved = new com.maxsolch.shop.returns.domain.OrderExchange[1];
        lenient().when(exchangeRepository.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.returns.domain.OrderExchange e = inv.getArgument(0);
            e.setId(5L);
            saved[0] = e;
            return e;
        });
        lenient().when(exchangeRepository.findById(5L)).thenAnswer(inv -> Optional.ofNullable(saved[0]));
    }

}
