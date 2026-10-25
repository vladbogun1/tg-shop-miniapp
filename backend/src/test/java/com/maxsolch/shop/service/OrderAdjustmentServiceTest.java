package com.maxsolch.shop.service;

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
        OrderService orderService = new OrderService(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService, events,
                promoService, cartService, messages, entityManager);
        service = new OrderAdjustmentService(orderRepository, orderService, events, exchangeRepository);
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
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
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

    @Test
    void exchange_returnsAndReplaces_backToNewWithoutTracking() {
        Order o = order(OrderStatus.DELIVERED);
        o.setTrackingNumber("20450000000000");
        o.setReceivedMinor(20_000);
        o.setPaid(true);
        Product mouse = product(5);
        Product other = product(3);
        other.setTitle("Клава");
        other.setPriceMinor(15_000);
        item(o, mouse, 1L, 2);
        o.setSubtotalMinor(20_000);
        o.setTotalMinor(20_000);
        when(productRepository.findByIdForUpdate(mouse.getId())).thenReturn(Optional.of(mouse));
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderAdjustmentService.Result r = service.exchange(o.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(1L, 1, true)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.NEW, true, "не подошёл цвет", "admin");

        Order saved = r.order();
        assertThat(mouse.getStock()).isEqualTo(6);          // back into circulation
        assertThat(other.getStock()).isEqualTo(2);          // reserved for the new parcel
        assertThat(saved.getItems()).hasSize(2);
        assertThat(saved.getItems().get(0).getQuantity()).isEqualTo(1);
        assertThat(saved.getTotalMinor()).isEqualTo(25_000);
        assertThat(saved.getReceivedMinor()).isEqualTo(20_000); // money untouched → 50 ₴ наложкой
        assertThat(saved.isPaid()).isTrue();
        assertThat(saved.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(saved.getTrackingNumber()).isNull();
        assertThat(saved.getDeliveredAt()).isNull();
        assertThat(r.auditDetails()).contains("Клава").contains("доплата 50 ₴").contains("20450000000000");

        ArgumentCaptor<com.maxsolch.shop.domain.OrderExchange> ex =
                ArgumentCaptor.forClass(com.maxsolch.shop.domain.OrderExchange.class);
        verify(exchangeRepository).save(ex.capture());
        assertThat(ex.getValue().getPreviousTracking()).isEqualTo("20450000000000");
        assertThat(ex.getValue().getPreviousStatus()).isEqualTo("DELIVERED");
        assertThat(ex.getValue().getReturnedSummary()).contains("(на склад)");
        assertThat(ex.getValue().getTotalBeforeMinor()).isEqualTo(20_000);
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue()).isInstanceOf(OrderEvents.Exchanged.class);
    }

    @Test
    void exchange_writeOff_removesLineWithoutRestock_andCanGoStraightToApproved() {
        Order o = order(OrderStatus.SHIPPED);
        Product mouse = product(5);
        Product other = product(3);
        other.setPriceMinor(5_000);
        item(o, mouse, 1L, 1);
        o.setSubtotalMinor(10_000);
        o.setTotalMinor(10_000);
        o.setReceivedMinor(10_000);
        when(productRepository.findByIdForUpdate(other.getId())).thenReturn(Optional.of(other));

        OrderAdjustmentService.Result r = service.exchange(o.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(1L, 1, false)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(other.getId()), null, 1)),
                OrderStatus.APPROVED, false, null, "admin");

        assertThat(mouse.getStock()).isEqualTo(5);          // written off
        assertThat(r.order().getItems()).hasSize(1);
        assertThat(r.order().getTotalMinor()).isEqualTo(5_000);
        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(r.order().getApprovedAt()).isNotNull();
        assertThat(r.auditDetails()).contains("к возврату 50 ₴").contains("списано");
    }

    @Test
    void exchange_beforeShipping_orWithoutReplacement_isRejected() {
        Order fresh = order(OrderStatus.APPROVED);
        Product mouse = product(5);
        item(fresh, mouse, 1L, 1);
        assertThatThrownBy(() -> service.exchange(fresh.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(1L, 1, true)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(mouse.getId()), null, 1)),
                OrderStatus.NEW, true, null, "admin"))
                .isInstanceOf(BadRequestException.class);

        Order delivered = order(OrderStatus.DELIVERED);
        item(delivered, mouse, 2L, 1);
        assertThatThrownBy(() -> service.exchange(delivered.getId(),
                List.of(new OrderAdjustmentService.ReturnLine(2L, 1, true)), List.of(),
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
                promoService, cartService, messages, entityManager);

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
    void unitPaidMinor_spreadsTheOrderDiscount_andGiftsCostNothing() {
        Order o = new Order();
        o.setItems(new ArrayList<>());
        o.setSubtotalMinor(40_000);
        o.setDiscountMinor(10_000);
        OrderItem it = item(o, product(1), 1L, 1);
        assertThat(OrderAdjustmentService.unitPaidMinor(o, it)).isEqualTo(7_500);
        it.setGift(true);
        assertThat(OrderAdjustmentService.unitPaidMinor(o, it)).isZero();
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
    void wizard_inTransit_notForAParcelStillOnItsWayOut() {
        Order o = order(OrderStatus.SHIPPED);
        o.setReceivedMinor(30_000);
        item(o, product(0), 1L, 1);

        assertThatThrownBy(() -> service.registerReturnPlan(o.getId(), plan(
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, OrderAdjustmentService.LineOutcome.IN_TRANSIT)),
                List.of(), 0, 0), "owner"))
                .isInstanceOf(BadRequestException.class);
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
}
