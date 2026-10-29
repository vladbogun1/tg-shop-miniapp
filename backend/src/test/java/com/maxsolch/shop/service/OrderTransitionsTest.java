package com.maxsolch.shop.service;

import com.maxsolch.shop.cart.app.CartService;
import com.maxsolch.shop.promo.app.PromoService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderMoneyMovement;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.RejectReasonCode;
import com.maxsolch.shop.gift.GiftService;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.platform.error.BadRequestException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Characterization of every way an order's status changes (tech-debt №3): the 5x5 matrix of
 * {@code changeStatus}, the exact end state of the four paths that end in REJECTED, and the two
 * places (merge, exchange) that change a status bypassing {@code afterTransition}. These tests pin
 * the CURRENT behaviour; a refactoring must keep them green.
 */
@ExtendWith(MockitoExtension.class)
class OrderTransitionsTest {

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
    com.maxsolch.shop.platform.i18n.Messages messages;
    @Mock
    EntityManager entityManager;
    @Mock
    GiftService giftService;
    @Mock
    MoneyLedger ledger;
    @Mock
    OrderExchangeRepository exchangeRepository;

    OrderService service;
    Product product;

    @BeforeEach
    void setUp() {
        service = OrderServiceFixtures.create(orderRepository, productRepository, promoCodeRepository,
                paymentOptionRepository, notificationService, events, promoService, cartService, messages,
                entityManager,
                StockFixtures.stock(productRepository, messages), ledger,
                org.mockito.Mockito.mock(com.maxsolch.shop.payment.PaymentInvoiceRepository.class), giftService,
                OrderServiceFixtures.unlimitedRegistry(), OrderServiceFixtures.noLowMargin());
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(messages.current(anyString(), any(Object[].class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
        product = new Product();
        product.setId(UuidUtil.randomBytes());
        product.setTitle("Кепка");
        product.setStock(3);
        product.setVariants(new ArrayList<>());
        lenient().when(productRepository.findByIdForUpdate(any())).thenReturn(Optional.of(product));
    }

    private Order order(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
        o.setTotalMinor(100_000);
        OrderItem it = new OrderItem();
        it.setOrder(o);
        it.setProductId(product.getId());
        it.setQuantity(2);
        it.setTitleSnapshot("Кепка");
        o.setItems(new ArrayList<>(List.of(it)));
        lenient().when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    private List<Object> published() {
        ArgumentCaptor<Object> c = ArgumentCaptor.forClass(Object.class);
        verify(events, org.mockito.Mockito.atLeast(0)).publishEvent(c.capture());
        return c.getAllValues();
    }

    private void verifyNoLedgerEntries() {
        verify(ledger, never()).record(any(), any(), any(), anyLong(), any(), any(), any(), any());
    }

    // ------------------------------------------------------------------ (а) the matrix

    /** {@code null} = allowed; otherwise the message of the refusal. */
    private static String expectedRefusal(OrderStatus from, OrderStatus to) {
        return switch (to) {
            case NEW -> "вернуть заказ в «Новые» нельзя";
            case APPROVED -> from == OrderStatus.NEW ? null : "одобрить можно только новый заказ";
            case SHIPPED -> from == OrderStatus.NEW || from == OrderStatus.APPROVED
                    ? null : "отправить можно только новый или одобренный заказ";
            case DELIVERED -> from == OrderStatus.SHIPPED
                    ? null : "доставленным можно отметить только отправленный заказ";
            case REJECTED -> switch (from) {
                case REJECTED -> "заказ уже отклонён";
                case DELIVERED -> OrderService.REJECT_DELIVERED;
                default -> null;
            };
        };
    }

    @Test
    void changeStatus_allTwentyFivePairs() {
        for (OrderStatus from : OrderStatus.values()) {
            for (OrderStatus to : OrderStatus.values()) {
                Order o = order(from);
                String refusal = expectedRefusal(from, to);
                String pair = from + " -> " + to;
                if (refusal == null) {
                    Order r = service.changeStatus(o.getId(), to, null, null, true);
                    assertThat(r.getStatus()).as(pair).isEqualTo(to);
                } else {
                    assertThatThrownBy(() -> service.changeStatus(o.getId(), to, null, null, true))
                            .as(pair).isInstanceOf(BadRequestException.class).hasMessage(refusal);
                    assertThat(o.getStatus()).as(pair).isEqualTo(from);
                }
            }
        }
    }

    @Test
    void changeStatus_errorCodes() {
        // Only the reject of a delivered order carries a code; the other refusals are plain.
        assertThatThrownBy(() -> service.changeStatus(order(OrderStatus.DELIVERED).getId(),
                OrderStatus.REJECTED, null, null, true))
                .isInstanceOfSatisfying(BadRequestException.class,
                        e -> assertThat(e.getCode()).isEqualTo("ORDER_DELIVERED_REJECT"));
        assertThatThrownBy(() -> service.changeStatus(order(OrderStatus.REJECTED).getId(),
                OrderStatus.REJECTED, null, null, true))
                .isInstanceOfSatisfying(BadRequestException.class, e -> assertThat(e.getCode()).isNull());
        assertThatThrownBy(() -> service.changeStatus(order(OrderStatus.SHIPPED).getId(),
                OrderStatus.APPROVED, null, null, true))
                .isInstanceOfSatisfying(BadRequestException.class, e -> assertThat(e.getCode()).isNull());
    }

    @Test
    void transitions_setTheirTimestampsAndFields() {
        Order a = order(OrderStatus.NEW);
        service.approve(a.getId());
        assertThat(a.getApprovedAt()).isNotNull();

        Order s = order(OrderStatus.APPROVED);
        service.ship(s.getId(), "  20450000000001 ");
        assertThat(s.getShippedAt()).isNotNull();
        assertThat(s.getTrackingNumber()).isEqualTo("20450000000001");

        Order d = order(OrderStatus.SHIPPED);
        d.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        service.deliver(d.getId());
        assertThat(d.getDeliveredAt()).isNotNull();
        assertThat(d.isPaid()).isTrue();
        assertThat(d.getReceivedMinor()).isEqualTo(100_000);
        verify(ledger).record(eq(d.getId()), eq(OrderMoneyMovement.Kind.PAYMENT),
                eq(OrderMoneyMovement.Channel.NP_COD), eq(100_000L), eq(OrderMoneyMovement.Source.AUTO),
                isNull(), anyString(), isNull());
        // approve/ship/deliver never revoke the case promo; each announces itself once.
        verify(giftService, never()).revokeCasePromo(any());
        assertThat(published()).hasSize(3).allMatch(e -> e instanceof OrderEvents.StatusChanged);
    }

    // ------------------------------------------------------------------ (г) cancel request vs ship / approve

    @Test
    void ship_andApprove_areBothBlockedByAPendingCancelRequest() {
        Order shipIt = order(OrderStatus.NEW);
        shipIt.setCancelRequestStatus("PENDING");
        assertThatThrownBy(() -> service.ship(shipIt.getId(), null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("запрос отмены");
        assertThat(shipIt.getStatus()).isEqualTo(OrderStatus.NEW);

        // Owner's decision 29.10.2026: approve is blocked the same way as ship.
        Order approveIt = order(OrderStatus.NEW);
        approveIt.setCancelRequestStatus("PENDING");
        assertThatThrownBy(() -> service.approve(approveIt.getId()))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("запрос отмены");
        assertThat(approveIt.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(approveIt.getApprovedAt()).isNull();
        assertThat(approveIt.getCancelRequestStatus()).isEqualTo("PENDING");
    }

    @Test
    void ship_unpaidOnlineOrderNeedsConfirmation() {
        Order o = order(OrderStatus.APPROVED);
        o.setPaymentDueAt(Instant.now().plusSeconds(3600));
        assertThatThrownBy(() -> service.ship(o.getId(), null))
                .isInstanceOfSatisfying(BadRequestException.class,
                        e -> assertThat(e.getCode()).isEqualTo(OrderService.SHIP_UNPAID_CODE));
        assertThat(service.ship(o.getId(), null, true).getStatus()).isEqualTo(OrderStatus.SHIPPED);
    }

    // ------------------------------------------------------------------ (б) the four REJECT paths

    @Test
    void cancelByCustomer_endState() {
        Order o = order(OrderStatus.APPROVED);
        o.setReturnStatus("X");

        Order r = service.cancelByCustomer(o.getId(), "  передумав  ");

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectedAt()).isNotNull();
        assertThat(r.getRejectReason()).isEqualTo("Отменён покупателем: передумав");
        assertThat(r.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
        assertThat(r.isCancelledByCustomer()).isTrue();
        assertThat(r.getReturnStatus()).isEqualTo("X");
        assertThat(r.getCancelRequestStatus()).isNull();
        assertThat(product.getStock()).isEqualTo(5);
        assertThat(r.getItems().get(0).getRestockedQty()).isEqualTo(2);
        verifyNoLedgerEntries();
        verify(giftService).revokeCasePromo(o.getId());
        assertThat(published()).hasSize(1).first().isInstanceOf(OrderEvents.StatusChanged.class);
    }

    @Test
    void cancelByCustomer_reasonIsTrimmedCutTo500_blankGivesTheBarePrefix() {
        Order longReason = order(OrderStatus.NEW);
        service.cancelByCustomer(longReason.getId(), "я".repeat(600));
        assertThat(longReason.getRejectReason()).isEqualTo("Отменён покупателем: " + "я".repeat(500));

        Order blank = order(OrderStatus.NEW);
        service.cancelByCustomer(blank.getId(), "   ");
        assertThat(blank.getRejectReason()).isEqualTo("Отменён покупателем");
        Order none = order(OrderStatus.NEW);
        service.cancelByCustomer(none.getId(), null);
        assertThat(none.getRejectReason()).isEqualTo("Отменён покупателем");
    }

    @Test
    void cancelByCustomer_leavesAPendingRequestUntouched() {
        // Unreachable through the API (a pending request needs a paid order), pinned as is.
        Order o = order(OrderStatus.NEW);
        o.setCancelRequestStatus("PENDING");
        service.cancelByCustomer(o.getId(), "x");
        assertThat(o.getCancelRequestStatus()).isEqualTo("PENDING");
        assertThat(o.getCancelRequestResolvedAt()).isNull();
    }

    @Test
    void cancelByCustomer_refusals() {
        Order paid = order(OrderStatus.NEW);
        paid.setPaid(true);
        assertThatThrownBy(() -> service.cancelByCustomer(paid.getId(), "x"))
                .isInstanceOfSatisfying(BadRequestException.class,
                        e -> assertThat(e.getCode()).isEqualTo(OrderService.PAID_NEEDS_REQUEST));
        Order received = order(OrderStatus.NEW);
        received.setReceivedMinor(1);
        assertThatThrownBy(() -> service.cancelByCustomer(received.getId(), "x"))
                .isInstanceOfSatisfying(BadRequestException.class,
                        e -> assertThat(e.getCode()).isEqualTo(OrderService.PAID_NEEDS_REQUEST));
        for (OrderStatus s : List.of(OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.REJECTED)) {
            Order o = order(s);
            assertThatThrownBy(() -> service.cancelByCustomer(o.getId(), "x"))
                    .isInstanceOfSatisfying(BadRequestException.class,
                            e -> assertThat(e.getCode()).isEqualTo(OrderService.CANNOT_CANCEL));
        }
        assertThat(product.getStock()).isEqualTo(3);
        verifyNoInteractions(giftService);
    }

    @Test
    void approveCancelRequest_endState() {
        Order o = order(OrderStatus.APPROVED);
        o.setPaid(true);
        o.setReceivedMinor(100_000);
        o.setReturnStatus("X");
        o.setCancelRequestStatus("PENDING");
        o.setCancelRequestReason("передумала");

        Order r = service.approveCancelRequest(o.getId(), "  ок  ");

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectedAt()).isNotNull().isEqualTo(r.getCancelRequestResolvedAt());
        assertThat(r.getRejectReason()).isEqualTo("Отменён по запросу покупателя: передумала");
        assertThat(r.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
        assertThat(r.isCancelledByCustomer()).isTrue();
        assertThat(r.getCancelRequestStatus()).isEqualTo("APPROVED");
        assertThat(r.getCancelRequestAdminComment()).isEqualTo("ок");
        assertThat(r.getReturnStatus()).isEqualTo("X");
        assertThat(product.getStock()).isEqualTo(5);
        verifyNoLedgerEntries();
        InOrder order = inOrder(giftService, orderRepository, events);
        order.verify(giftService).revokeCasePromo(o.getId());
        order.verify(orderRepository).save(o);
        order.verify(events).publishEvent(any(OrderEvents.StatusChanged.class));
        order.verify(events).publishEvent(any(OrderEvents.CancelRequestResolved.class));
        List<Object> ev = published();
        assertThat(ev).hasSize(2);
        assertThat(((OrderEvents.CancelRequestResolved) ev.get(1)).approved()).isTrue();
    }

    @Test
    void approveCancelRequest_blankCommentIsNull_noRequest_wrongStatus() {
        Order o = order(OrderStatus.NEW);
        o.setCancelRequestStatus("PENDING");
        service.approveCancelRequest(o.getId(), "  ");
        assertThat(o.getCancelRequestAdminComment()).isNull();
        // Empty request reason: no dangling colon.
        assertThat(o.getRejectReason()).isEqualTo("Отменён по запросу покупателя");

        Order none = order(OrderStatus.NEW);
        assertThatThrownBy(() -> service.approveCancelRequest(none.getId(), null))
                .isInstanceOfSatisfying(BadRequestException.class,
                        e -> assertThat(e.getCode()).isEqualTo(OrderService.NO_PENDING_REQUEST));

        Order shipped = order(OrderStatus.SHIPPED);
        shipped.setCancelRequestStatus("PENDING");
        assertThatThrownBy(() -> service.approveCancelRequest(shipped.getId(), null))
                .isInstanceOfSatisfying(BadRequestException.class, e -> {
                    assertThat(e.getCode()).isEqualTo(OrderService.CANNOT_CANCEL);
                    assertThat(e.getMessage()).isEqualTo("заказ уже SHIPPED — отмена по запросу невозможна");
                });
    }

    @Test
    void reject_endState_restock() {
        Order o = order(OrderStatus.APPROVED);
        o.setReturnStatus("X");

        Order r = service.reject(o.getId(), "  нет в наличии ", RejectReasonCode.OUT_OF_STOCK, true);

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectedAt()).isNotNull();
        assertThat(r.getRejectReason()).isEqualTo("нет в наличии");
        assertThat(r.getRejectReasonCode()).isEqualTo("OUT_OF_STOCK");
        assertThat(r.isCancelledByCustomer()).isFalse();
        assertThat(r.getReturnStatus()).isEqualTo("X");
        assertThat(r.getCancelRequestStatus()).isNull();
        assertThat(product.getStock()).isEqualTo(5);
        verify(giftService).revokeCasePromo(o.getId());
        assertThat(published()).hasSize(1).first().isInstanceOf(OrderEvents.StatusChanged.class);
    }

    @Test
    void reject_withoutRestock_blankReasonAndNoCode() {
        Order o = order(OrderStatus.NEW);
        Order r = service.reject(o.getId(), "  ", false);
        assertThat(r.getRejectReason()).isNull();
        assertThat(r.getRejectReasonCode()).isNull();
        assertThat(product.getStock()).isEqualTo(3);
        assertThat(r.getItems().get(0).getRestockedQty()).isZero();
    }

    @Test
    void reject_whileACancelRequestIsPending_closesItAsApproved_andAnswersTheCustomer() {
        Order o = order(OrderStatus.NEW);
        o.setPaid(true);
        o.setReceivedMinor(100_000);
        o.setCancelRequestStatus("PENDING");

        service.reject(o.getId(), "x", null, true);

        assertThat(o.getCancelRequestStatus()).isEqualTo("APPROVED");
        assertThat(o.getCancelRequestResolvedAt()).isNotNull();
        assertThat(o.getCancelRequestAdminComment()).isNull();
        // Owner's decision 29.10.2026: the customer gets the same answer as on «Одобрить и вернуть».
        List<Object> ev = published();
        assertThat(ev).hasSize(2);
        assertThat(ev.get(0)).isInstanceOf(OrderEvents.StatusChanged.class);
        assertThat(ev.get(1)).isInstanceOfSatisfying(OrderEvents.CancelRequestResolved.class,
                e -> assertThat(e.approved()).isTrue());
    }

    @Test
    void reject_shippedInTransit_noRestockNow_marksReturnPending() {
        Order o = order(OrderStatus.SHIPPED);
        Order r = service.reject(o.getId(), "не забрал", RejectReasonCode.CHANGED_MIND, true, true);

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getReturnStatus()).isEqualTo(OrderService.RETURN_IN_TRANSIT);
        assertThat(r.getReturnSentAt()).isNotNull();
        assertThat(r.getItems().get(0).getReturnPendingQty()).isEqualTo(2);
        assertThat(product.getStock()).isEqualTo(3);
        assertThat(r.getItems().get(0).getRestockedQty()).isZero();
    }

    @Test
    void reject_inTransitFlagIsIgnoredForNonShipped_restockStillApplies() {
        Order o = order(OrderStatus.APPROVED);
        service.reject(o.getId(), null, null, true, true);
        assertThat(o.getReturnStatus()).isNull();
        assertThat(product.getStock()).isEqualTo(5);
    }

    @Test
    void reject_shippedKeepsThePrepaymentAsRetained() {
        Order o = order(OrderStatus.SHIPPED);
        o.setPrepaymentMinor(10_000);
        o.setReceivedMinor(10_000);
        o.setPaid(true);

        service.reject(o.getId(), null, null, true, true);

        verify(ledger).record(eq(o.getId()), eq(OrderMoneyMovement.Kind.RETAINED),
                eq(OrderMoneyMovement.Channel.OTHER), eq(10_000L), eq(OrderMoneyMovement.Source.AUTO),
                isNull(), eq("предоплата удержана: доставка"), isNull());
    }

    @Test
    void reject_nonShipped_orMoreThanPrepaid_retainsNothing() {
        Order approved = order(OrderStatus.APPROVED);
        approved.setPrepaymentMinor(10_000);
        approved.setReceivedMinor(10_000);
        service.reject(approved.getId(), null, null, true);
        Order shipped = order(OrderStatus.SHIPPED);
        shipped.setPrepaymentMinor(10_000);
        shipped.setReceivedMinor(50_000);
        service.reject(shipped.getId(), null, null, true);
        verifyNoLedgerEntries();
    }

    @Test
    void expireUnpaid_endState() {
        Order o = order(OrderStatus.NEW);
        Instant now = Instant.now();
        o.setPaymentDueAt(now.minusSeconds(1));
        o.setReturnStatus("X");

        Order r = service.expireUnpaid(o.getId(), now);

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectedAt()).isEqualTo(now);
        assertThat(r.getRejectReason()).isEqualTo("Не оплачен в течение 24 ч");
        assertThat(r.getRejectReasonCode()).isEqualTo("PAYMENT_TIMEOUT");
        assertThat(r.isCancelledByCustomer()).isFalse();
        assertThat(r.getReturnStatus()).isEqualTo("X");
        assertThat(product.getStock()).isEqualTo(5);
        verify(giftService).revokeCasePromo(o.getId());
        assertThat(published()).hasSize(1).first().isInstanceOf(OrderEvents.StatusChanged.class);
    }

    @Test
    void expireUnpaid_skipsAnythingThatNoLongerQualifies() {
        Instant now = Instant.now();
        List<Order> skipped = new ArrayList<>();
        Order approved = order(OrderStatus.APPROVED);
        approved.setPaymentDueAt(now.minusSeconds(1));
        skipped.add(approved);
        Order paid = order(OrderStatus.NEW);
        paid.setPaymentDueAt(now.minusSeconds(1));
        paid.setPaid(true);
        skipped.add(paid);
        Order received = order(OrderStatus.NEW);
        received.setPaymentDueAt(now.minusSeconds(1));
        received.setReceivedMinor(5);
        skipped.add(received);
        Order notDue = order(OrderStatus.NEW);
        notDue.setPaymentDueAt(now.plusSeconds(60));
        skipped.add(notDue);
        skipped.add(order(OrderStatus.NEW)); // no deadline at all
        for (Order o : skipped) {
            OrderStatus before = o.getStatus();
            assertThat(service.expireUnpaid(o.getId(), now)).isNull();
            assertThat(o.getStatus()).isEqualTo(before);
        }
        assertThat(product.getStock()).isEqualTo(3);
        verifyNoInteractions(giftService);
        verify(events, never()).publishEvent(any(Object.class));
    }

    // ------------------------------------------------------------------ (в) merge / exchange bypass afterTransition

    private Order mergeable(OrderStatus status, long tgUser) {
        Order o = order(status);
        o.setTgUserId(tgUser);
        o.setPhone("+380671234567");
        o.setCreatedAt(Instant.now());
        o.getItems().get(0).setPriceMinorSnapshot(50_000);
        o.setSubtotalMinor(100_000);
        return o;
    }

    @Test
    void merge_closesTheSourceWithoutStatusChangedAndWithoutRevokingTheCasePromo() {
        ApplicationEventPublisher mergeEvents = org.mockito.Mockito.mock(ApplicationEventPublisher.class);
        OrderMergeService merge = new OrderMergeService(orderRepository, service, mergeEvents, ledger);
        Order target = mergeable(OrderStatus.APPROVED, 42);
        Order source = mergeable(OrderStatus.NEW, 42);
        source.setPromoCode("CASE9TSRK7");

        OrderMergeService.Result r = merge.merge(target.getId(), source.getId(), false, false, null, "admin");

        assertThat(r.source().getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.source().getRejectReasonCode()).isEqualTo("MERGED");
        // Intentionally: no StatusChanged, and the case prize code stays with the buyer
        // (an open case is not sealed, the prize remains his); see docs/tech-debt-2026-10.md.
        ArgumentCaptor<Object> c = ArgumentCaptor.forClass(Object.class);
        verify(mergeEvents).publishEvent(c.capture());
        assertThat(c.getAllValues()).hasSize(1).first().isInstanceOf(OrderEvents.Merged.class);
        verify(events, never()).publishEvent(any(OrderEvents.StatusChanged.class));
        verify(giftService, never()).revokeCasePromo(any());
    }

    @Test
    void exchange_newOrderStartedApproved_noStatusChangedAndNoRevoke() {
        OrderAdjustmentService adjust = new OrderAdjustmentService(orderRepository, service, StockFixtures.stock(productRepository, messages), events, exchangeRepository, ledger);
        Order o = order(OrderStatus.DELIVERED);
        o.setCustomerName("Іван Петренко");
        o.setPhone("+380501112233");
        o.setDeliveryMethod(DeliveryMethod.NOVA_POSHTA);
        o.setNpCityRef("city-1");
        o.setNpCityName("Київ");
        o.setNpWarehouseRef("wh-1");
        o.setNpWarehouseName("Відділення №1");
        o.setPaymentOptionId(UuidUtil.randomBytes());
        o.setReceivedMinor(100_000);
        o.setPaid(true);
        o.setUserId(77L);
        o.getItems().get(0).setId(1L);
        o.getItems().get(0).setPriceMinorSnapshot(50_000);
        o.setSubtotalMinor(100_000);
        List<Order> all = new ArrayList<>(List.of(o));
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
                .filter(y -> java.util.Arrays.equals(y.getId(), inv.getArgument(0))).findFirst());
        PaymentOption po = new PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle("Наложений платіж");
        lenient().when(paymentOptionRepository.findById(any())).thenReturn(Optional.of(po));
        lenient().when(paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(po));

        OrderAdjustmentService.Result r = adjust.exchange(o.getId(),
                List.of(new OrderAdjustmentService.WizardLine(1L, 1, null)),
                List.of(new OrderAdjustmentService.ExchangeNewLine(UuidUtil.toString(product.getId()), null, 1)),
                OrderStatus.APPROVED, false, null, "admin");

        assertThat(r.order().getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(r.order().getApprovedAt()).isNotNull();
        assertThat(o.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        // Intentionally: the replacement order is born APPROVED without StatusChanged (the
        // dispatch card is posted by the Exchanged handler); see docs/tech-debt-2026-10.md.
        verify(events, never()).publishEvent(any(OrderEvents.StatusChanged.class));
        verify(events).publishEvent(any(OrderEvents.Exchanged.class));
        verify(giftService, never()).revokeCasePromo(any());
    }
}
