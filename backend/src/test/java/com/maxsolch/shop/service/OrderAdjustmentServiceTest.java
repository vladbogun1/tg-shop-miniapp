package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.OrderMoney;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderAdjustmentServiceTest {

    @Mock
    OrderRepository orderRepository;
    @Mock
    ProductRepository productRepository;
    @Mock
    PromoCodeRepository promoCodeRepository;
    @Mock
    PaymentOptionRepository paymentOptionRepository;
    @Mock
    NotificationService notificationService;
    @Mock
    ApplicationEventPublisher events;
    @Mock
    PromoService promoService;
    @Mock
    CartService cartService;
    @Mock
    com.maxsolch.shop.i18n.Messages messages;

    @Mock
    jakarta.persistence.EntityManager entityManager;

    @Mock
    com.maxsolch.shop.repository.OrderExchangeRepository exchangeRepository;

    OrderAdjustmentService service;

    @BeforeEach
    void setUp() {
        OrderStock stock = StockFixtures.stock(productRepository, messages);
        OrderService orderService = new OrderService(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager, stock, org.mockito.Mockito.mock(MoneyLedger.class));
        service = new OrderAdjustmentService(orderRepository, orderService, stock, events, exchangeRepository);
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
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

    private Product product(int stock) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Мишка");
        p.setStock(stock);
        p.setVariants(new ArrayList<>());
        return p;
    }

    private OrderItem item(Order o, Product p, long id, int qty) {
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

    // ---------- tracking ----------

    @Test
    void updateTracking_shippedOrder_replacesNumberAndNotifiesCustomer() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTrackingNumber("20450000000000");

        OrderAdjustmentService.Result r = service.updateTracking(o.getId(), " 2045 0000 0000 01 ");

        assertThat(r.order().getTrackingNumber()).isEqualTo("20450000000001");
        assertThat(r.auditDetails()).contains("20450000000000").contains("20450000000001");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        OrderEvents.Edited edited = (OrderEvents.Edited) event.getValue();
        assertThat(edited.kind()).isEqualTo(OrderEvents.EditKind.TRACKING);
        assertThat(edited.notifyCustomer()).isTrue();
    }

    @Test
    void updateTracking_beforeShipping_isRejected() {
        Order o = order(OrderStatus.APPROVED);

        assertThatThrownBy(() -> service.updateTracking(o.getId(), "20450000000001"))
                .isInstanceOf(BadRequestException.class);
        verify(events, never()).publishEvent(any());
    }

    // ---------- delivery ----------

    @Test
    void updateDelivery_changesOnlyGivenFields_andDescribesThem() {
        Order o = order(OrderStatus.APPROVED);

        OrderAdjustmentService.Result r = service.updateDelivery(o.getId(),
                new OrderAdjustmentService.DeliveryPatch(null, "+380671234567",
                        "city-2", "Львів", "wh-9", "Відділення №9"));

        assertThat(r.order().getCustomerName()).isEqualTo("Іван Петренко");
        assertThat(r.order().getPhone()).isEqualTo("+380671234567");
        assertThat(r.order().getNpWarehouseRef()).isEqualTo("wh-9");
        assertThat(r.order().getNpCityName()).isEqualTo("Львів");
        assertThat(r.auditDetails()).contains("телефон").contains("Львів");
    }

    @Test
    void updateDelivery_halfAnAddress_isRejected() {
        Order o = order(OrderStatus.NEW);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderAdjustmentService.DeliveryPatch(null, null, "city-2", "Львів", null, null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void updateDelivery_deliveredOrder_isRejected() {
        Order o = order(OrderStatus.DELIVERED);

        assertThatThrownBy(() -> service.updateDelivery(o.getId(),
                new OrderAdjustmentService.DeliveryPatch("Нове Ім'я", null, null, null, null, null)))
                .isInstanceOf(BadRequestException.class);
    }

    // ---------- exchange ----------

    /** Saved orders get an id like @PrePersist would, and are found again by findByIdForUpdate. */
    private List<Order> trackOrders(Order original) {
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
        com.maxsolch.shop.domain.PaymentOption po = new com.maxsolch.shop.domain.PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle("Наложений платіж");
        lenient().when(paymentOptionRepository.findById(any())).thenReturn(Optional.of(po));
        lenient().when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(po));
        return all;
    }

    @Test
    void exchange_deliveredOrderKeepsItsTracking_replacementIsANewLinkedOrder() {
        Order o = order(OrderStatus.DELIVERED);
        o.setTrackingNumber("20450000000000");
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(20_000);
        o.setPaid(true);
        o.setUserId(77L);
        Product mouse = product(5);
        Product other = product(3);
        other.setTitle("Клава");
        other.setPriceMinor(15_000);
        item(o, mouse, 1L, 2);
        o.setSubtotalMinor(20_000);
        o.setTotalMinor(20_000);
        List<Order> all = trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderAdjustmentService.Result r = service.exchange(o.getId(),
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, null)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, "не подошёл цвет", "admin");

        // The delivered order stays where it was; the unit is on its way back.
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(o.getTrackingNumber()).isEqualTo("20450000000000");
        assertThat(o.getItems().get(0).getReturnPendingQty()).isEqualTo(1);
        assertThat(o.getReturnStatus()).isEqualTo(OrderService.RETURN_IN_TRANSIT);
        assertThat(o.getRefundedMinor()).isEqualTo(10_000);       // paid value moved over
        assertThat(mouse.getStock()).isEqualTo(5);                // not on the shelf yet

        Order child = r.order();
        assertThat(child).isNotSameAs(o);
        assertThat(all).contains(child);
        assertThat(child.getExchangeOfOrderId()).isEqualTo(o.getId());
        assertThat(child.getUserId()).isEqualTo(77L);
        assertThat(child.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(child.getTrackingNumber()).isNull();
        assertThat(child.getTotalMinor()).isEqualTo(15_000);
        assertThat(child.getReceivedMinor()).isEqualTo(10_000);   // credit; 50 ₴ to pay
        assertThat(child.getPaymentDueAt()).isNull();
        // The difference can be paid online in full (or наложкой): no prepayment cap.
        assertThat(child.getPrepaymentMinor()).isZero();
        assertThat(OrderMoney.amountDueMinor(child)).isEqualTo(5_000);
        assertThat(other.getStock()).isEqualTo(2);                // reserved for the new parcel
        assertThat(r.auditDetails()).contains("Клава").contains("зачтено 100 ₴").contains("доплата 50 ₴");

        ArgumentCaptor<com.maxsolch.shop.domain.OrderExchange> ex =
                ArgumentCaptor.forClass(com.maxsolch.shop.domain.OrderExchange.class);
        verify(exchangeRepository).save(ex.capture());
        assertThat(ex.getValue().getOrderId()).isEqualTo(o.getId());
        assertThat(ex.getValue().getNewOrderId()).isEqualTo(child.getId());
        assertThat(ex.getValue().getReturnedSummary()).contains("(едет назад)");
        assertThat(ex.getValue().getTotalBeforeMinor()).isEqualTo(10_000);
        verify(events).publishEvent(any(OrderEvents.Exchanged.class));
    }

    @Test
    void exchange_creditFollowsTheExactPaidAmountOfTheLine() {
        // 3333 x 3 with 10 ₴ off, paid 89.99: exchanging all three moves exactly 89.99 over, not 90.00.
        Order o = order(OrderStatus.DELIVERED);
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(8_999);
        o.setPaid(true);
        o.setUserId(77L);
        Product other = product(3);
        other.setPriceMinor(20_000);
        OrderItem line = item(o, product(5), 1L, 3);
        line.setPriceMinorSnapshot(3_333);
        o.setSubtotalMinor(9_999);
        o.setDiscountMinor(1_000);
        o.setTotalMinor(8_999);
        trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        service.exchange(o.getId(),
                List.of(new OrderAdjustmentService.WizardLine(1L, 3, null)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin");

        assertThat(o.getRefundedMinor()).isEqualTo(8_999);
    }

    @Test
    void exchange_alreadyAtTheShop_writeOff_cheaperReplacementLeavesTheRestRefundable() {
        Order o = order(OrderStatus.DELIVERED);
        Product mouse = product(5);
        Product other = product(3);
        other.setPriceMinor(5_000);
        item(o, mouse, 1L, 1);
        o.setSubtotalMinor(10_000);
        o.setTotalMinor(10_000);
        o.setReceivedMinor(10_000);
        trackOrders(o);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderAdjustmentService.Result r = service.exchange(o.getId(),
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.DEFECT)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.APPROVED, false, null, "admin");

        assertThat(mouse.getStock()).isEqualTo(5);                // written off, not restocked
        assertThat(o.getItems().get(0).getReturnedQty()).isEqualTo(1);
        assertThat(o.getReturnStatus()).isNull();
        assertThat(o.getRefundedMinor()).isEqualTo(5_000);        // only what the new order takes
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(r.order().getApprovedAt()).isNotNull();
        assertThat(r.order().isPaid()).isTrue();
        assertThat(r.auditDetails()).contains("к возврату 50 ₴").contains("брак");
    }

    @Test
    void exchange_notDelivered_keptGoods_orWithoutReplacement_isRejected() {
        Product mouse = product(5);
        Order shipped = order(OrderStatus.SHIPPED);
        item(shipped, mouse, 1L, 1);
        assertThatThrownBy(() -> service.exchange(shipped.getId(),
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, null)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("после доставки");

        Order delivered = order(OrderStatus.DELIVERED);
        item(delivered, mouse, 2L, 1);
        assertThatThrownBy(() -> service.exchange(delivered.getId(),
                List.of(new OrderAdjustmentService.WizardLine(2L, 1, null)), List.of(),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.exchange(delivered.getId(),
                List.of(new OrderAdjustmentService.WizardLine(2L, 1, OrderAdjustmentService.LineOutcome.KEPT)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.exchange(delivered.getId(),
                List.of(new OrderAdjustmentService.WizardLine(2L, 2, null)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(BadRequestException.class);
        verify(events, never()).publishEvent(any());
    }

    @Test
    void registerReturn_newOrderAfterCheaperExchange_refundsOnlyTheOverpayment() {
        Order o = order(OrderStatus.NEW);
        o.setTotalMinor(5_000);
        o.setReceivedMinor(20_000);

        assertThatThrownBy(() -> service.registerReturn(o.getId(), List.of(), 16_000, null))
                .isInstanceOf(BadRequestException.class);
        OrderAdjustmentService.Result r = service.registerReturn(o.getId(), List.of(), 15_000, "разница за обмен");

        assertThat(r.order().getRefundedMinor()).isEqualTo(15_000);
        assertThatThrownBy(() -> service.registerReturn(o.getId(), List.of(), 1_000, null))
                .isInstanceOf(BadRequestException.class); // nothing overpaid any more
    }

    @Test
    void deliver_afterCheaperExchange_keepsTheOverpayment() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(5_000);
        o.setReceivedMinor(10_000);
        o.setPaid(true);
        OrderService orderService = new OrderService(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), org.mockito.Mockito.mock(MoneyLedger.class));

        Order delivered = orderService.deliver(o.getId());

        assertThat(delivered.getReceivedMinor()).isEqualTo(10_000);
    }

    // ---------- returns ----------

    @Test
    void registerReturn_partial_restocksOnlyChosenUnits_andRecordsRefund() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        Product mouse = product(5);
        Product pad = product(2);
        OrderItem a = item(o, mouse, 1L, 2);
        OrderItem b = item(o, pad, 2L, 1);
        when(productRepository.findByIdForUpdate(mouse.getId())).thenReturn(Optional.of(mouse));

        OrderAdjustmentService.Result r = service.registerReturn(o.getId(), List.of(
                new OrderAdjustmentService.ReturnLine(1L, 1, true),
                new OrderAdjustmentService.ReturnLine(2L, 1, false)), 15_000, "брак коврика");

        assertThat(mouse.getStock()).isEqualTo(6);
        assertThat(pad.getStock()).isEqualTo(2); // not sellable — stays off the shelf
        assertThat(a.getReturnedQty()).isEqualTo(1);
        assertThat(a.getRestockedQty()).isEqualTo(1);
        assertThat(b.getReturnedQty()).isEqualTo(1);
        assertThat(b.getRestockedQty()).isZero();
        assertThat(r.order().getRefundedMinor()).isEqualTo(15_000);
        assertThat(r.order().getReturnedAt()).isNotNull();
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(r.auditDetails()).contains("150 ₴").contains("брак коврика");
    }

    @Test
    void registerReturn_moreThanOrdered_isRejected() {
        Order o = order(OrderStatus.SHIPPED);
        Product mouse = product(5);
        OrderItem a = item(o, mouse, 1L, 2);
        a.setReturnedQty(2);

        assertThatThrownBy(() -> service.registerReturn(o.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(1L, 1, true)), 0, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("не больше 0");
    }

    @Test
    void registerReturn_refundAboveReceived_isRejected() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(5_000);

        assertThatThrownBy(() -> service.registerReturn(o.getId(), List.of(), 6_000, null))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void registerReturn_rejectedOrder_allowsRefundOnly() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        Product mouse = product(5);
        item(o, mouse, 1L, 1);

        assertThatThrownBy(() -> service.registerReturn(o.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(1L, 1, true)), 0, null))
                .isInstanceOf(BadRequestException.class);

        OrderAdjustmentService.Result r = service.registerReturn(o.getId(), List.of(), 10_000, null);
        assertThat(r.order().getRefundedMinor()).isEqualTo(10_000);
    }

    @Test
    void registerReturn_nothingGiven_isRejected() {
        Order o = order(OrderStatus.DELIVERED);

        assertThatThrownBy(() -> service.registerReturn(o.getId(), List.of(), 0, null))
                .isInstanceOf(BadRequestException.class);
    }

    // ---------- return wizard (V68) ----------

    private MoneyLedger wireLedger() {
        MoneyLedger ledger = org.mockito.Mockito.mock(MoneyLedger.class);
        service.setMoneyLedger(ledger);
        return ledger;
    }

    private static OrderAdjustmentService.ReturnPlan plan(List<OrderAdjustmentService.WizardLine> lines,
                                                          List<OrderAdjustmentService.ManualRefund> refunds,
                                                          long retain, long mono) {
        return new OrderAdjustmentService.ReturnPlan(lines, refunds, retain, mono, null, false);
    }

    @Test
    void wizard_rejectedOrder_retainsPrepaymentAndRefundsTheRest_inTheJournal() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(30_000);
        MoneyLedger ledger = wireLedger();

        OrderAdjustmentService.Result r = service.registerReturnPlan(o.getId(), plan(List.of(),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 20_000, null)),
                10_000, 0), "owner");

        assertThat(r.order().getRefundedMinor()).isEqualTo(20_000);
        assertThat(r.order().getReturnedAt()).isNotNull();
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER), eq(20_000L),
                any(), eq("owner"), any(), any());
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.domain.OrderMoneyMovement.Kind.RETAINED),
                any(), eq(10_000L), any(), eq("owner"), any(), any());
        assertThat(r.auditDetails()).contains("удержано").contains("перевод на карту");
    }

    @Test
    void wizard_moreThanReceived_isRejected() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(2_000);
        wireLedger();

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(List.of(),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CASH, 5_000, null)),
                4_000, 0), "owner"))
                .isInstanceOf(BadRequestException.class);
        assertThat(o.getRefundedMinor()).isEqualTo(2_000);
    }

    @Test
    void wizard_rejectedOrder_withGoods_isRejected() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(10_000);
        Product p = product(0);
        item(o, p, 1L, 1);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.RESTOCK)),
                List.of(), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void wizard_refundWithoutChannel_isRejected() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(List.of(),
                List.of(new OrderAdjustmentService.ManualRefund(null, 1_000, null)), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void wizard_defect_isWrittenOffAtThePaidPrice_notRestocked() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setSubtotalMinor(20_000);
        o.setDiscountMinor(2_000);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 2);
        wireLedger();
        com.maxsolch.shop.repository.StockWriteoffRepository writeoffs =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.StockWriteoffRepository.class);
        service.setWriteoffs(writeoffs);

        service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.DEFECT)),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 9_000, null)),
                0, 0), "owner");

        assertThat(it.getReturnedQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isZero();
        assertThat(p.getStock()).isZero();
        ArgumentCaptor<com.maxsolch.shop.domain.StockWriteoff> w =
                ArgumentCaptor.forClass(com.maxsolch.shop.domain.StockWriteoff.class);
        verify(writeoffs).save(w.capture());
        assertThat(w.getValue().getQuantity()).isEqualTo(1);
        // 10 000 at −10 % order discount
        assertThat(w.getValue().getUnitValueMinor()).isEqualTo(9_000);
        assertThat(w.getValue().getReason()).isEqualTo("DEFECT");
    }

    @Test
    void receiveReturn_onlyForAParcelOnItsWayBack() {
        Order o = order(OrderStatus.REJECTED);

        assertThatThrownBy(() -> service.receiveReturn(o.getId(), List.of(), null, "owner"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void receiveReturn_brokenUnits_areWrittenOff_andTheParcelIsMarkedReceived() {
        Order o = order(OrderStatus.REJECTED);
        o.setReturnStatus(OrderService.RETURN_IN_TRANSIT);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 1);
        com.maxsolch.shop.repository.StockWriteoffRepository writeoffs =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.StockWriteoffRepository.class);
        service.setWriteoffs(writeoffs);

        OrderAdjustmentService.Result r = service.receiveReturn(o.getId(),
                List.of(new OrderAdjustmentService.ReceivedLine(1L, 1, OrderAdjustmentService.LineOutcome.DEFECT)),
                null, "owner");

        assertThat(r.order().getReturnStatus()).isEqualTo(OrderService.RETURN_RECEIVED);
        assertThat(r.order().getReturnReceivedAt()).isNotNull();
        assertThat(it.getReturnedQty()).isEqualTo(1);
        verify(writeoffs).save(any());
    }

    @Test
    void wizard_prepaymentAlreadyRetainedOnRefusal_cannotBeKeptOrRefundedAgain() {
        Order o = order(OrderStatus.REJECTED);
        o.setReceivedMinor(20_000);
        MoneyLedger ledger = wireLedger();
        when(ledger.retainedMinor(o.getId())).thenReturn(20_000L);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(List.of(), List.of(), 20_000, 0), "owner"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("уже удержанных");
        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(List.of(),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CASH, 1_000, null)), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void wizard_monoAlreadySent_isLeftOutOfTheLimit() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(10_000);
        o.setRefundedMinor(10_000); // the bank refund is already booked by the time the books are written
        wireLedger();

        OrderAdjustmentService.Result r = service.registerReturnPlan(o.getId(), plan(List.of(), List.of(), 0, 10_000),
                "owner", true);
        assertThat(r.auditDetails()).contains("monobank");
    }

    // ---------- «Едет назад» per line (V68) ----------

    @Test
    void wizard_inTransit_countsTheUnitsReturned_butKeepsThemOffTheShelf() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        Product mouse = product(0);
        OrderItem it = item(o, mouse, 1L, 3);
        wireLedger();

        OrderAdjustmentService.Result r = service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner");

        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(r.order().getReturnStatus()).isEqualTo(OrderService.RETURN_IN_TRANSIT);
        assertThat(r.order().getReturnSentAt()).isNotNull();
        assertThat(it.getReturnedQty()).isEqualTo(1);
        assertThat(it.getReturnPendingQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isZero();
        assertThat(mouse.getStock()).isZero();
        assertThat(r.auditDetails()).contains("едет назад");
    }

    @Test
    void wizard_shippedParcelRefusedWhole_isARejectionNotAPartialPickup() {
        Order o = order(OrderStatus.SHIPPED);
        o.setReceivedMinor(30_000);
        item(o, product(0), 1L, 1);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("не забрал ничего");
    }

    @Test
    void wizard_partialPickupWithCod_refusedPartComesOffNalozhka_andDeliveryBooksOnlyTheRest() {
        // 1C60C7C7: prepayment 100 ₴, the customer took the keyboard and refused the mouse at the branch.
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(30_000);
        o.setSubtotalMinor(30_000);
        o.setPrepaymentMinor(100);
        o.setReceivedMinor(100);
        o.setPaid(true);
        Product mouse = product(0);
        OrderItem keyboard = item(o, product(0), 1L, 2);
        OrderItem refused = item(o, mouse, 2L, 1);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(2L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT)),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 100, null)), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("вернуть нечего");

        OrderAdjustmentService.Result r = service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(2L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner");

        assertThat(r.order().getUncollectedMinor()).isEqualTo(10_000);
        assertThat(r.order().getReturnStatus()).isEqualTo(OrderService.RETURN_IN_TRANSIT);
        assertThat(refused.getReturnPendingQty()).isEqualTo(1);
        assertThat(keyboard.getReturnedQty()).isZero();
        assertThat(mouse.getStock()).isZero(); // on its way, not on the shelf yet
        assertThat(OrderMoney.codMinor(r.order())).isEqualTo(19_900);
        assertThat(r.auditDetails()).contains("не выкуплено на почте 100 ₴").contains("наложка теперь 199 ₴");

        OrderService orderService = new OrderService(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager,
                StockFixtures.stock(productRepository, messages), org.mockito.Mockito.mock(MoneyLedger.class));
        Order delivered = orderService.deliver(o.getId());

        assertThat(delivered.getReceivedMinor()).isEqualTo(20_000);
        assertThat(OrderMoney.codMinor(delivered)).isZero();
    }

    @Test
    void wizard_partialPickupWithADiscount_refusingALineInStepsNeverExceedsItsPaidAmount() {
        // 3333 x 3 with 10 ₴ off: the line cost 89.99 (total), not 90.00.
        Order o = order(OrderStatus.SHIPPED);
        o.setSubtotalMinor(9_999);
        o.setDiscountMinor(1_000);
        o.setTotalMinor(8_999);
        OrderItem line = item(o, product(0), 1L, 3);
        line.setPriceMinorSnapshot(3_333);
        List<OrderAdjustmentService.WizardLine> one =
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT));

        assertThat(service.registerReturnPlan(o.getId(), plan(one, List.of(), 0, 0), "owner")
                .order().getUncollectedMinor()).isEqualTo(2_999);
        assertThat(service.registerReturnPlan(o.getId(), plan(one, List.of(), 0, 0), "owner")
                .order().getUncollectedMinor()).isEqualTo(5_999);   // 2999 + 3000 = floor(8999 * 2 / 3)
        assertThat(line.getReturnedQty()).isEqualTo(2);
        assertThat(OrderMoney.codMinor(o)).isEqualTo(3_000);        // the last unit: 8999 - 5999
    }

    @Test
    void wizard_partialPickupOfAPrepaidOrder_refundsTheRefusedPart() {
        Order o = order(OrderStatus.SHIPPED);
        o.setTotalMinor(30_000);
        o.setSubtotalMinor(30_000);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        item(o, product(0), 1L, 2);
        item(o, product(0), 2L, 1);
        List<OrderAdjustmentService.WizardLine> back =
                List.of(new OrderAdjustmentService.WizardLine(2L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT));

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(back,
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_001, null)), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("100 ₴");

        OrderAdjustmentService.Result r = service.registerReturnPlan(o.getId(), plan(back,
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_000, null)), 0, 0), "owner");

        assertThat(r.order().getUncollectedMinor()).isEqualTo(10_000);
        assertThat(r.order().getRefundedMinor()).isEqualTo(10_000);
        assertThat(OrderMoney.codMinor(r.order())).isZero();
    }

    @Test
    void receiveReturn_partialReturnOfADeliveredOrder_takesOnlyTheTravellingUnits() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReturnStatus(OrderService.RETURN_IN_TRANSIT);
        Product mouse = product(0);
        OrderItem back = item(o, mouse, 1L, 3);
        back.setReturnedQty(2);
        back.setReturnPendingQty(2);
        OrderItem stays = item(o, product(0), 2L, 1);
        when(productRepository.findByIdForUpdate(mouse.getId())).thenReturn(Optional.of(mouse));
        com.maxsolch.shop.repository.StockWriteoffRepository writeoffs =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.StockWriteoffRepository.class);
        service.setWriteoffs(writeoffs);

        OrderAdjustmentService.Result r = service.receiveReturn(o.getId(),
                List.of(new OrderAdjustmentService.ReceivedLine(1L, 1, OrderAdjustmentService.LineOutcome.DEFECT)),
                null, "owner");

        assertThat(r.order().getReturnStatus()).isEqualTo(OrderService.RETURN_RECEIVED);
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(mouse.getStock()).isEqualTo(1);
        assertThat(back.getRestockedQty()).isEqualTo(1);
        assertThat(back.getReturnedQty()).isEqualTo(2);
        assertThat(back.getReturnPendingQty()).isZero();
        assertThat(stays.getRestockedQty()).isZero();
        verify(writeoffs).save(any());
    }

    // ---------- cancelling a return (V70) ----------

    /** In-memory return records: ids assigned on save, lookups the service uses. */
    private List<com.maxsolch.shop.domain.OrderReturnLine> wireReturnRecords(List<com.maxsolch.shop.domain.OrderReturn> recs) {
        List<com.maxsolch.shop.domain.OrderReturnLine> lines = new ArrayList<>();
        com.maxsolch.shop.repository.OrderReturnRepository recRepo =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.OrderReturnRepository.class);
        com.maxsolch.shop.repository.OrderReturnLineRepository lineRepo =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.OrderReturnLineRepository.class);
        lenient().when(recRepo.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.domain.OrderReturn r = inv.getArgument(0);
            if (r.getId() == null) {
                r.setId((long) recs.size() + 1);
                recs.add(r);
            }
            return r;
        });
        lenient().when(recRepo.findByOrderIdOrderByIdAsc(any())).thenAnswer(inv -> new ArrayList<>(recs));
        lenient().when(lineRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<com.maxsolch.shop.domain.OrderReturnLine> it = inv.getArgument(0);
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
        service.setReturnRecords(recRepo, lineRepo);
        return lines;
    }

    @Test
    void cancelReturn_restockedUnitsLeaveTheShelf_andTheMoneyComesBack() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        Product p = product(3);
        OrderItem it = item(o, p, 1L, 2);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        MoneyLedger ledger = wireLedger();
        List<com.maxsolch.shop.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);

        service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 2, OrderAdjustmentService.LineOutcome.RESTOCK)),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 20_000, null)),
                0, 0), "owner");
        assertThat(p.getStock()).isEqualTo(5);
        assertThat(o.getRefundedMinor()).isEqualTo(20_000);
        assertThat(recs).hasSize(1);

        assertThatThrownBy(() -> service.cancelReturn(o.getId(), recs.get(0).getId(),
                OrderAdjustmentService.CancelMoney.RETURNED, "", "owner"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.cancelReturn(o.getId(), recs.get(0).getId(), null, "передумал", "owner"))
                .isInstanceOf(BadRequestException.class); // money was given — the choice is required

        service.cancelReturn(o.getId(), recs.get(0).getId(), OrderAdjustmentService.CancelMoney.RETURNED,
                "передумал", "owner");

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(it.getReturnedQty()).isZero();
        assertThat(it.getRestockedQty()).isZero();
        assertThat(o.getRefundedMinor()).isZero();
        assertThat(recs.get(0).getCancelledAt()).isNotNull();
        assertThat(recs.get(0).getCancelNote()).isEqualTo("передумал");
        verify(ledger).record(eq(o.getId()), eq(com.maxsolch.shop.domain.OrderMoneyMovement.Kind.REFUND),
                eq(com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER), eq(-20_000L), any(),
                any(), any(), any());
        assertThatThrownBy(() -> service.cancelReturn(o.getId(), recs.get(0).getId(),
                OrderAdjustmentService.CancelMoney.RETURNED, "ещё раз", "owner"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void cancelReturn_unitAlreadySoldAgain_isRefused_andDebtIsRecordedOtherwise() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        Product p = product(0);
        item(o, p, 1L, 1);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        wireLedger();
        List<com.maxsolch.shop.domain.OrderReturn> recs = new ArrayList<>();
        wireReturnRecords(recs);
        service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.RESTOCK)),
                List.of(new OrderAdjustmentService.ManualRefund(
                        com.maxsolch.shop.domain.OrderMoneyMovement.Channel.CARD_TRANSFER, 10_000, null)),
                0, 0), "owner");
        p.setStock(0); // sold to someone else meanwhile

        assertThatThrownBy(() -> service.cancelReturn(o.getId(), recs.get(0).getId(),
                OrderAdjustmentService.CancelMoney.DEBT, "передумал", "owner"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("уже продали");

        p.setStock(1);
        service.cancelReturn(o.getId(), recs.get(0).getId(), OrderAdjustmentService.CancelMoney.DEBT,
                "передумал", "owner");
        assertThat(recs.get(0).getDebtMinor()).isEqualTo(10_000);
        assertThat(o.getRefundedMinor()).isEqualTo(10_000); // nothing came back yet

        service.settleReturnDebt(o.getId(), recs.get(0).getId(), "owner");
        assertThat(recs.get(0).getDebtPaidAt()).isNotNull();
        assertThat(o.getRefundedMinor()).isZero();
    }

    @Test
    void restoreWriteoff_defectGoesBackOnTheShelf_andCancelThenTakesItFromThere() {
        Order o = order(OrderStatus.DELIVERED);
        o.setReceivedMinor(30_000);
        o.setPaid(true);
        Product p = product(0);
        OrderItem it = item(o, p, 1L, 1);
        when(productRepository.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        wireLedger();
        List<com.maxsolch.shop.domain.OrderReturn> recs = new ArrayList<>();
        List<com.maxsolch.shop.domain.OrderReturnLine> lines = wireReturnRecords(recs);
        com.maxsolch.shop.repository.StockWriteoffRepository writeoffs =
                org.mockito.Mockito.mock(com.maxsolch.shop.repository.StockWriteoffRepository.class);
        List<com.maxsolch.shop.domain.StockWriteoff> saved = new ArrayList<>();
        when(writeoffs.save(any())).thenAnswer(inv -> {
            com.maxsolch.shop.domain.StockWriteoff w = inv.getArgument(0);
            if (w.getId() == null) {
                w.setId(77L);
                saved.add(w);
            }
            return w;
        });
        when(writeoffs.findById(77L)).thenAnswer(inv -> Optional.of(saved.get(0)));
        service.setWriteoffs(writeoffs);

        service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.DEFECT)),
                List.of(), 0, 0), "owner");
        assertThat(lines.get(0).getWriteoffId()).isEqualTo(77L);
        assertThat(p.getStock()).isZero();

        service.restoreWriteoff(77L, 1, "оказалось целым", "owner");
        assertThat(p.getStock()).isEqualTo(1);
        assertThat(saved.get(0).activeQty()).isZero();
        assertThat(lines.get(0).getDefectQty()).isZero();
        assertThat(lines.get(0).getRestockedQty()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isEqualTo(1);
        assertThatThrownBy(() -> service.restoreWriteoff(77L, 1, null, "owner"))
                .isInstanceOf(BadRequestException.class);

        service.cancelReturn(o.getId(), recs.get(0).getId(), null, "передумал", "owner");
        assertThat(p.getStock()).isZero();
        assertThat(it.getReturnedQty()).isZero();
        assertThat(it.getRestockedQty()).isZero();
    }
}
