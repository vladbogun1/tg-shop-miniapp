package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
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
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Customer cancellation of orders: immediate for unpaid ones, a request for paid ones. */
@ExtendWith(MockitoExtension.class)
class OrderCancelRequestTest {

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
    EntityManager entityManager;

    OrderService service;
    Product product;

    @BeforeEach
    void setUp() {
        service = new OrderService(orderRepository, productRepository, promoCodeRepository,
                paymentOptionRepository, notificationService, events, promoService, cartService, messages,
                entityManager);
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

    private Order order(OrderStatus status, long received) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
        o.setTotalMinor(100_000);
        o.setReceivedMinor(received);
        o.setPaid(received > 0);
        OrderItem it = new OrderItem();
        it.setOrder(o);
        it.setProductId(product.getId());
        it.setQuantity(2);
        it.setTitleSnapshot("Кепка");
        o.setItems(new ArrayList<>(java.util.List.of(it)));
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        return o;
    }

    private static String code(Throwable e) {
        return ((BadRequestException) e).getCode();
    }

    // ---------------------------------------------------------------- immediate cancel

    @Test
    void unpaid_cancelsAtOnce_restocks_andCountsAsSelfCancel() {
        Order o = order(OrderStatus.NEW, 0);
        Order r = service.cancelByCustomer(o.getId(), "передумав");
        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
        assertThat(r.isCancelledByCustomer()).isTrue();
        assertThat(product.getStock()).isEqualTo(5);
    }

    @Test
    void paid_cannotBeCancelledAtOnce_needsRequest() {
        Order o = order(OrderStatus.NEW, 10_000);
        assertThatThrownBy(() -> service.cancelByCustomer(o.getId(), null))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.PAID_NEEDS_REQUEST));
        assertThat(o.getStatus()).isEqualTo(OrderStatus.NEW);
    }

    @Test
    void shipped_cannotBeCancelled() {
        Order o = order(OrderStatus.SHIPPED, 0);
        assertThatThrownBy(() -> service.cancelByCustomer(o.getId(), null))
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.CANNOT_CANCEL));
    }

    // ---------------------------------------------------------------- request

    @Test
    void request_onPaidOrder_isPending_orderUntouched() {
        Order o = order(OrderStatus.APPROVED, 100_000);
        Order r = service.requestCancel(o.getId(), "  замовив не той розмір ");
        assertThat(r.getCancelRequestStatus()).isEqualTo("PENDING");
        assertThat(r.getCancelRequestReason()).isEqualTo("замовив не той розмір");
        assertThat(r.getCancelRequestedAt()).isNotNull();
        assertThat(r.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(product.getStock()).isEqualTo(3);
        verify(events).publishEvent(any(OrderEvents.CancelRequested.class));
    }

    @Test
    void request_needsReason_upTo500() {
        Order o = order(OrderStatus.NEW, 100_000);
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "  "))
                .hasMessage("api.cancelRequest.reasonRequired");
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "x".repeat(501)))
                .hasMessage("api.cancelRequest.reasonTooLong");
    }

    @Test
    void request_onUnpaidOrder_isRefused() {
        Order o = order(OrderStatus.NEW, 0);
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "причина"))
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.CANCEL_REQUEST_UNPAID));
    }

    @Test
    void request_onShippedOrder_isRefused() {
        Order o = order(OrderStatus.SHIPPED, 100_000);
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "причина"))
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.CANNOT_CANCEL));
    }

    @Test
    void secondRequest_isRefused_alsoAfterDecline() {
        Order o = order(OrderStatus.NEW, 100_000);
        service.requestCancel(o.getId(), "причина");
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "ще раз"))
                .hasMessage("api.cancelRequest.exists")
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.CANCEL_REQUEST_EXISTS));

        service.declineCancelRequest(o.getId(), "Вже відправляємо");
        assertThatThrownBy(() -> service.requestCancel(o.getId(), "ще раз"))
                .hasMessage("api.cancelRequest.declinedBefore");
    }

    // ---------------------------------------------------------------- admin

    @Test
    void approve_rejectsWithChangedMind_restocks_closesRequest() {
        Order o = order(OrderStatus.NEW, 100_000);
        service.requestCancel(o.getId(), "причина");

        Order r = service.approveCancelRequest(o.getId(), null);

        assertThat(r.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(r.getRejectReasonCode()).isEqualTo("CHANGED_MIND");
        assertThat(r.getCancelRequestStatus()).isEqualTo("APPROVED");
        assertThat(r.getCancelRequestResolvedAt()).isNotNull();
        assertThat(r.isCancelledByCustomer()).isTrue();
        assertThat(product.getStock()).isEqualTo(5);
        verify(events).publishEvent(any(OrderEvents.StatusChanged.class));
        verify(events).publishEvent(new OrderEvents.CancelRequestResolved(o.getId(), true));
    }

    @Test
    void decline_needsComment_keepsOrder() {
        Order o = order(OrderStatus.APPROVED, 100_000);
        service.requestCancel(o.getId(), "причина");
        assertThatThrownBy(() -> service.declineCancelRequest(o.getId(), " "))
                .isInstanceOf(BadRequestException.class);

        Order r = service.declineCancelRequest(o.getId(), "Посилка вже в дорозі");

        assertThat(r.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(r.getCancelRequestStatus()).isEqualTo("DECLINED");
        assertThat(r.getCancelRequestAdminComment()).isEqualTo("Посилка вже в дорозі");
        assertThat(product.getStock()).isEqualTo(3);
    }

    @Test
    void approveOrDecline_withoutPendingRequest_isRefused() {
        Order o = order(OrderStatus.NEW, 100_000);
        assertThatThrownBy(() -> service.approveCancelRequest(o.getId(), null))
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.NO_PENDING_REQUEST));
        assertThatThrownBy(() -> service.declineCancelRequest(o.getId(), "x"))
                .satisfies(e -> assertThat(code(e)).isEqualTo(OrderService.NO_PENDING_REQUEST));
        verify(events, never()).publishEvent(any(OrderEvents.CancelRequestResolved.class));
    }

    @Test
    void adminRejectWhilePending_closesTheRequest() {
        Order o = order(OrderStatus.NEW, 100_000);
        service.requestCancel(o.getId(), "причина");
        Order r = service.reject(o.getId(), "нема в наявності", true);
        assertThat(r.getCancelRequestStatus()).isEqualTo("APPROVED");
        assertThat(r.isCancelledByCustomer()).isFalse();
    }
}
