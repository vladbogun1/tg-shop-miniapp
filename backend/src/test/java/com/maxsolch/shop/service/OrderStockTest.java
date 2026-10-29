package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.costing.LotLedger;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.preorder.PreorderQueueService;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The stock side of an order through the public {@link OrderService} methods: reserve on checkout and on
 * adding a line, give back on REJECT / removing a line / a smaller quantity, the FIFO lots
 * ({@link LotLedger}) and the pre-order queue ({@link PreorderQueueService}) that go with every move.
 */
@ExtendWith(MockitoExtension.class)
class OrderStockTest {

    @Mock OrderRepository orderRepository;
    @Mock ProductRepository productRepository;
    @Mock PromoCodeRepository promoCodeRepository;
    @Mock PaymentOptionRepository paymentOptionRepository;
    @Mock NotificationService notificationService;
    @Mock ApplicationEventPublisher events;
    @Mock PromoService promoService;
    @Mock CartService cartService;
    @Mock Messages messages;
    @Mock EntityManager entityManager;
    @Mock LotLedger lots;
    @Mock PreorderQueueService queue;

    OrderService service;
    PaymentOption pay;

    @BeforeEach
    void setUp() {
        service = newService();
        lenient().when(promoService.remainingUses(any(), any())).thenReturn(Long.MAX_VALUE);
        lenient().when(messages.current(any(String.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(messages.current(any(String.class), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
        pay = new PaymentOption();
        pay.setId(UuidUtil.randomBytes());
        pay.setTitle("Полная оплата");
        pay.setActive(true);
        lenient().when(paymentOptionRepository.findById(any())).thenReturn(Optional.of(pay));
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            if (o.getId() == null) {
                o.setId(UuidUtil.randomBytes());
            }
            return o;
        });
    }

    private OrderService newService() {
        return OrderServiceFixtures.create(orderRepository, productRepository, promoCodeRepository,
                paymentOptionRepository, notificationService, events, promoService, cartService, messages, entityManager,
                new OrderStock(productRepository, messages, lots, queue), org.mockito.Mockito.mock(MoneyLedger.class));
    }

    private Product product(int stock) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Мишка");
        p.setPriceMinor(1_000);
        p.setStock(stock);
        p.setActive(true);
        p.setVariants(new ArrayList<>());
        lenient().when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private ProductVariant variant(Product p, String name, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName(name);
        v.setStock(stock);
        p.getVariants().add(v);
        p.setStock(p.getVariants().stream().mapToInt(ProductVariant::getStock).sum());
        return v;
    }

    private Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
        o.setItems(new ArrayList<>());
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    private OrderItem line(Order o, Product p, ProductVariant v, long id, int qty) {
        OrderItem it = new OrderItem();
        it.setId(id);
        it.setOrder(o);
        it.setProductId(p.getId());
        it.setVariantId(v == null ? null : v.getId());
        it.setTitleSnapshot(p.getTitle());
        it.setQuantity(qty);
        it.setPriceMinorSnapshot(1_000);
        o.getItems().add(it);
        return it;
    }

    private CreateOrderCommand checkout(Product p, ProductVariant v, int qty, Long userId) {
        return new CreateOrderCommand(userId, 555L, "buyer",
                List.of(new CreateOrderCommand.Line(UuidUtil.toString(p.getId()),
                        v == null ? null : UuidUtil.toString(v.getId()), qty)),
                "Buyer", "+380000000000", null, null, "PICKUP", null, null, null, null,
                UuidUtil.toString(pay.getId()));
    }

    // ---------- checkout ----------

    @Test
    void checkout_takesUnitsThenLotsThenTellsTheQueue() {
        Product p = product(10);
        Order o = service.createOrder(checkout(p, null, 3, 7L));

        assertThat(p.getStock()).isEqualTo(7);
        OrderItem item = o.getItems().get(0);
        InOrder order = inOrder(queue, lots);
        order.verify(queue).heldForOthers(p.getId(), null, 7L);
        order.verify(lots).take(p.getId(), null, 3, item);
        order.verify(queue).onStockTaken(p, null, 7);
        order.verify(queue).onOrderPlaced(eq(7L), eq(o.getId()), any());
    }

    @Test
    void checkout_variant_decrementsVariantAndRollup_andPassesTheVariantToLotsAndQueue() {
        Product p = product(0);
        ProductVariant m = variant(p, "M", 4);
        variant(p, "L", 2);

        Order o = service.createOrder(checkout(p, m, 3, 7L));

        assertThat(m.getStock()).isEqualTo(1);
        assertThat(p.getStock()).isEqualTo(3);
        verify(lots).take(p.getId(), m.getId(), 3, o.getItems().get(0));
        verify(queue).onStockTaken(p, m, 1);
    }

    @Test
    void checkout_guestWithoutUserId_doesNotCloseQueuePlaces() {
        Product p = product(10);
        service.createOrder(checkout(p, null, 1, null));
        verify(queue).heldForOthers(p.getId(), null, null);
        verify(queue, never()).onOrderPlaced(any(), any(), any());
    }

    @Test
    void checkout_unitsHeldForOthersAreNotForSale() {
        Product p = product(5);
        when(queue.heldForOthers(p.getId(), null, 7L)).thenReturn(3);

        assertThatThrownBy(() -> service.createOrder(checkout(p, null, 3, 7L)))
                .isInstanceOf(BadRequestException.class);
        verify(messages).current("api.order.outOfStock", "Мишка", 2);
        assertThat(p.getStock()).isEqualTo(5);
        verify(lots, never()).take(any(), any(), anyInt(), any());
    }

    @Test
    void checkout_heldForOthersLeavesEnough_goesThrough() {
        Product p = product(5);
        when(queue.heldForOthers(p.getId(), null, 7L)).thenReturn(3);
        service.createOrder(checkout(p, null, 2, 7L));
        assertThat(p.getStock()).isEqualTo(3);
    }

    @Test
    void checkout_variantHeldForOthers_namesTheVariantAndClampsAtZero() {
        Product p = product(0);
        ProductVariant m = variant(p, "M", 2);
        when(queue.heldForOthers(p.getId(), m.getId(), 7L)).thenReturn(5);

        assertThatThrownBy(() -> service.createOrder(checkout(p, m, 1, 7L))).isInstanceOf(BadRequestException.class);
        verify(messages).current("api.order.outOfStock", "Мишка (M)", 0);
    }

    @Test
    void checkout_oversell_refusedWithTheRealStock_nothingTouched() {
        Product p = product(2);
        assertThatThrownBy(() -> service.createOrder(checkout(p, null, 3, 7L))).isInstanceOf(BadRequestException.class);
        verify(messages).current("api.order.outOfStock", "Мишка", 2);
        assertThat(p.getStock()).isEqualTo(2);
        verify(lots, never()).take(any(), any(), anyInt(), any());
        verify(queue, never()).onStockTaken(any(), any(), anyInt());
    }

    @Test
    void checkout_variantOversell_refusedNamingTheVariant() {
        Product p = product(0);
        ProductVariant m = variant(p, "M", 1);
        assertThatThrownBy(() -> service.createOrder(checkout(p, m, 2, 7L))).isInstanceOf(BadRequestException.class);
        verify(messages).current("api.order.outOfStock", "Мишка (M)", 1);
        assertThat(m.getStock()).isEqualTo(1);
    }

    // ---------- giving back ----------

    @Test
    void reject_withRestock_givesEveryLineBackToItsLotsAndWakesTheQueue() {
        Product p = product(1);
        ProductVariant m = variant(p, "M", 1);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, m, 1, 3);

        service.reject(o.getId(), "нет", true);

        assertThat(m.getStock()).isEqualTo(4);
        assertThat(p.getStock()).isEqualTo(4);
        verify(lots).give(p.getId(), m.getId(), 3, it);
        verify(queue).onStockReturned(p, m);
        verify(productRepository).save(p);
        assertThat(it.getRestockedQty()).isEqualTo(3);
    }

    @Test
    void reject_withoutRestock_touchesNothing() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        line(o, p, null, 1, 3);

        service.reject(o.getId(), "нет", false);

        assertThat(p.getStock()).isEqualTo(1);
        verifyNoInteractions(lots);
        verify(queue, never()).onStockReturned(any(), any());
    }

    @Test
    void reject_variantDeletedFromCatalog_unitsGoBackOnTheProduct_noLotsNoQueue() {
        Product p = product(2);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 1, 3);
        it.setVariantId(UuidUtil.randomBytes()); // variant that no longer exists

        service.reject(o.getId(), "нет", true);

        assertThat(p.getStock()).isEqualTo(5);
        verifyNoInteractions(lots);
        verify(queue, never()).onStockReturned(any(), any());
        verify(productRepository).save(p);
    }

    @Test
    void reject_productDeletedFromCatalog_isSkipped() {
        Product p = product(2);
        Order o = order(OrderStatus.NEW);
        line(o, p, null, 1, 3);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.empty());

        service.reject(o.getId(), "нет", true);

        verifyNoInteractions(lots);
    }

    @Test
    void reject_onlyUnitsNotAlreadyBackOrWrittenOffAreRestocked_andLineIsMarked() {
        Product p = product(0);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 1, 5);
        it.setRestockedQty(2);
        it.setReturnedQty(2);

        service.reject(o.getId(), "нет", true);

        assertThat(p.getStock()).isEqualTo(3);
        verify(lots).give(p.getId(), null, 3, it);
        assertThat(it.getRestockedQty()).isEqualTo(5);
    }

    @Test
    void reject_fullyReturnedLine_givesNothing() {
        Product p = product(0);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 1, 2);
        it.setReturnedQty(2);

        service.reject(o.getId(), "нет", true);

        assertThat(p.getStock()).isZero();
        verifyNoInteractions(lots);
        verify(productRepository, never()).findByIdForUpdate(any());
    }

    // ---------- admin edits ----------

    @Test
    void addItem_reservesUnitsLotsAndQueue() {
        Product p = product(5);
        Order o = order(OrderStatus.NEW);

        Order saved = service.addItem(o.getId(), UuidUtil.toString(p.getId()), null, 2, true, false);

        assertThat(p.getStock()).isEqualTo(3);
        OrderItem it = saved.getItems().get(0);
        verify(lots).take(p.getId(), null, 2, it);
        verify(queue).onStockTaken(p, null, 3);
        // the admin path does not look at holds for others
        verify(queue, never()).heldForOthers(any(), any(), any());
    }

    @Test
    void addItem_sameGiftTwice_mergesIntoTheLine_reservesTheNewUnits() {
        Product p = product(5);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 1, 1);
        it.setGift(true);

        service.addItem(o.getId(), UuidUtil.toString(p.getId()), null, 2, true, false);

        assertThat(o.getItems()).hasSize(1);
        assertThat(it.getQuantity()).isEqualTo(3);
        assertThat(p.getStock()).isEqualTo(3);
        verify(lots).take(p.getId(), null, 2, it);
    }

    @Test
    void addItem_moreThanInStock_refused() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        assertThatThrownBy(() -> service.addItem(o.getId(), UuidUtil.toString(p.getId()), null, 2, false, false))
                .isInstanceOf(BadRequestException.class);
        assertThat(p.getStock()).isEqualTo(1);
        assertThat(o.getItems()).isEmpty();
    }

    @Test
    void removeItem_putsTheLineBackAndMarksIt() {
        Product p = product(1);
        Order o = order(OrderStatus.APPROVED);
        OrderItem it = line(o, p, null, 9, 2);

        service.removeItem(o.getId(), 9);

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(o.getItems()).isEmpty();
        verify(lots).give(p.getId(), null, 2, it);
        verify(queue).onStockReturned(p, null);
    }

    @Test
    void changeItemQuantity_up_reservesTheDelta() {
        Product p = product(5);
        ProductVariant m = variant(p, "M", 5);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, m, 9, 2);

        service.changeItemQuantity(o.getId(), 9, 5, false);

        assertThat(m.getStock()).isEqualTo(2);
        assertThat(p.getStock()).isEqualTo(2);
        verify(lots).take(p.getId(), m.getId(), 3, it);
        verify(queue).onStockTaken(p, m, 2);
        assertThat(it.getQuantity()).isEqualTo(5);
    }

    @Test
    void changeItemQuantity_down_releasesTheDelta() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 9, 4);

        service.changeItemQuantity(o.getId(), 9, 1, false);

        assertThat(p.getStock()).isEqualTo(4);
        verify(lots).give(p.getId(), null, 3, it);
        verify(queue).onStockReturned(p, null);
    }

    @Test
    void changeItemQuantity_same_touchesNoStock() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        line(o, p, null, 9, 4);

        service.changeItemQuantity(o.getId(), 9, 4, false);

        verify(productRepository, never()).findByIdForUpdate(any());
        verifyNoInteractions(lots);
    }

    @Test
    void changeItemQuantity_moreThanInStock_refusedAndLineKept() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        OrderItem it = line(o, p, null, 9, 2);

        assertThatThrownBy(() -> service.changeItemQuantity(o.getId(), 9, 9, false))
                .isInstanceOf(BadRequestException.class);
        assertThat(p.getStock()).isEqualTo(1);
        assertThat(it.getQuantity()).isEqualTo(2);
    }

    @Test
    void changeItemQuantity_productGone_refused() {
        Product p = product(1);
        Order o = order(OrderStatus.NEW);
        line(o, p, null, 9, 2);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changeItemQuantity(o.getId(), 9, 3, false))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("product not found");
    }

    // ---------- case prize ----------

    @Test
    void removeCasePrizeForSwap_givesTheUnitBack() {
        Product p = product(0);
        ProductVariant m = variant(p, "M", 3);
        Order o = order(OrderStatus.NEW);
        o.setGiftCaseStatus(OrderService.GIFT_CASE_OPENED);
        OrderItem it = line(o, p, m, 5, 1);
        it.setGift(true);
        it.setAutoGift(true);
        it.setCaseRarity("RARE");

        service.removeCasePrizeForSwap(o.getId());

        assertThat(m.getStock()).isEqualTo(4);
        assertThat(o.getItems()).isEmpty();
        verify(lots).give(p.getId(), m.getId(), 1, it);
    }

    @Test
    void chooseCasePrizeSize_movesTheHold_lotsGoBackThenTakeAgain() {
        Product p = product(0);
        ProductVariant m = variant(p, "M", 3);
        ProductVariant l = variant(p, "L", 1);
        Order o = order(OrderStatus.NEW);
        o.setGiftCaseStatus(OrderService.GIFT_CASE_OPENED);
        OrderItem it = line(o, p, m, 5, 1);
        it.setGift(true);
        it.setAutoGift(true);
        it.setCaseRarity("RARE");
        it.setVariantPending(true);

        service.chooseCasePrizeSize(o.getId(), UuidUtil.toString(l.getId()));

        assertThat(m.getStock()).isEqualTo(4);
        assertThat(l.getStock()).isZero();
        assertThat(p.getStock()).isEqualTo(4);
        InOrder io = inOrder(lots, productRepository);
        io.verify(lots).give(p.getId(), m.getId(), 1, it);
        io.verify(lots).take(p.getId(), l.getId(), 1, it);
        io.verify(productRepository).save(p);
        assertThat(it.getVariantId()).isEqualTo(l.getId());
    }
}
