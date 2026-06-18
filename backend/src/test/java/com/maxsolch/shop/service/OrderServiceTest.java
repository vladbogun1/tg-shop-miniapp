package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.tg.NotificationService;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

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

    OrderService service;

    private String productUuid;
    private byte[] productId;

    @BeforeEach
    void setUp() {
        service = new OrderService(orderRepository, productRepository,
                promoCodeRepository, paymentOptionRepository, notificationService);
        productUuid = UUID.randomUUID().toString();
        productId = UuidUtil.toBytes(productUuid);
        // orderRepository.save returns the same instance with an id assigned (PrePersist not run here).
        lenient().when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            if (o.getId() == null) {
                o.setId(UuidUtil.randomBytes());
            }
            return o;
        });
    }

    private Product simpleProduct(int stock, long priceMinor) {
        Product p = new Product();
        p.setId(productId);
        p.setTitle("Test Product");
        p.setPriceMinor(priceMinor);
        p.setStock(stock);
        p.setActive(true);
        p.setArchived(false);
        p.setVariants(new ArrayList<>());
        return p;
    }

    private ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName("Size M");
        v.setStock(stock);
        return v;
    }

    private CreateOrderCommand cmd(List<CreateOrderCommand.Line> lines, String promoCode) {
        return new CreateOrderCommand(
                1L, 555L, "buyer",
                lines,
                "John Buyer", "+380000000000", "comment",
                promoCode,
                "PICKUP",
                null, null, null, null,
                null);
    }

    // ---------- createOrder happy path ----------

    @Test
    void createOrder_happyPath_setsTotalsStockSnapshotsAndStatusNew() {
        Product p = simpleProduct(10, 2_500); // 25.00
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 2)), null);

        Order order = service.createOrder(command);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.NEW);
        assertThat(order.getCurrency()).isEqualTo("UAH");
        assertThat(order.getSubtotalMinor()).isEqualTo(5_000); // 2 * 2500
        assertThat(order.getDiscountMinor()).isZero();
        assertThat(order.getTotalMinor()).isEqualTo(5_000);
        assertThat(order.getCustomerName()).isEqualTo("John Buyer");

        // item snapshot
        assertThat(order.getItems()).hasSize(1);
        OrderItem it = order.getItems().get(0);
        assertThat(it.getTitleSnapshot()).isEqualTo("Test Product");
        assertThat(it.getPriceMinorSnapshot()).isEqualTo(2_500);
        assertThat(it.getQuantity()).isEqualTo(2);

        // stock decremented by qty
        assertThat(p.getStock()).isEqualTo(8);

        verify(productRepository).saveAll(any());
        verify(orderRepository).save(any(Order.class));
        verify(notificationService).onNewOrder(any(Order.class));
        verify(notificationService).notifyCustomerStatus(any(Order.class));
    }

    @Test
    void createOrder_withVariant_decrementsVariantAndProductStock() {
        Product p = simpleProduct(10, 1_000);
        ProductVariant v = variant(p, 4);
        p.getVariants().add(v);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        String variantUuid = UuidUtil.toString(v.getId());
        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, variantUuid, 3)), null);

        Order order = service.createOrder(command);

        assertThat(v.getStock()).isEqualTo(1);   // 4 - 3
        assertThat(p.getStock()).isEqualTo(7);   // rollup 10 - 3
        OrderItem it = order.getItems().get(0);
        assertThat(it.getVariantNameSnapshot()).isEqualTo("Size M");
        assertThat(it.getVariantId()).isEqualTo(v.getId());
    }

    // ---------- stock / variant validation ----------

    @Test
    void createOrder_outOfStock_throws() {
        Product p = simpleProduct(1, 1_000);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 5)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not enough stock");
        verify(orderRepository, never()).save(any());
    }

    @Test
    void createOrder_variantRequiredButMissing_throws() {
        Product p = simpleProduct(10, 1_000);
        p.getVariants().add(variant(p, 5)); // product has variants
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null); // no variant

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("variant is required");
    }

    @Test
    void createOrder_variantNotBelongingToProduct_throws() {
        Product p = simpleProduct(10, 1_000);
        p.getVariants().add(variant(p, 5));
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        String foreignVariant = UUID.randomUUID().toString();
        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, foreignVariant, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("variant does not belong to product");
    }

    @Test
    void createOrder_variantOutOfStock_throws() {
        Product p = simpleProduct(10, 1_000);
        ProductVariant v = variant(p, 1);
        p.getVariants().add(v);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, UuidUtil.toString(v.getId()), 5)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not enough stock for variant");
    }

    @Test
    void createOrder_emptyItems_throws() {
        CreateOrderCommand command = cmd(List.of(), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("no items");
    }

    @Test
    void createOrder_inactiveProduct_throws() {
        Product p = simpleProduct(10, 1_000);
        p.setActive(false);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), null);

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("not available");
    }

    // ---------- promo ----------

    @Test
    void createOrder_percentPromo_appliesPercentDiscount() {
        Product p = simpleProduct(10, 10_000); // 100.00
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("SAVE10");
        promo.setDiscountPercent(10);
        promo.setDiscountAmountMinor(0);
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrue("SAVE10")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "SAVE10");

        Order order = service.createOrder(command);

        assertThat(order.getSubtotalMinor()).isEqualTo(10_000);
        assertThat(order.getDiscountMinor()).isEqualTo(1_000); // 10% of 10000
        assertThat(order.getTotalMinor()).isEqualTo(9_000);
        assertThat(order.getPromoCode()).isEqualTo("SAVE10");
        assertThat(promo.getUsesCount()).isEqualTo(1);
        verify(promoCodeRepository).save(promo);
    }

    @Test
    void createOrder_fixedAmount_takesPriorityOverPercent() {
        Product p = simpleProduct(10, 10_000);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("MIX");
        promo.setDiscountPercent(50);          // would be 5000
        promo.setDiscountAmountMinor(2_000);   // fixed wins
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrue("MIX")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "MIX");

        Order order = service.createOrder(command);

        assertThat(order.getDiscountMinor()).isEqualTo(2_000); // fixed amount, not 5000
        assertThat(order.getTotalMinor()).isEqualTo(8_000);
    }

    @Test
    void createOrder_fixedAmountExceedsSubtotal_totalNeverNegative() {
        Product p = simpleProduct(10, 3_000);
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

        PromoCode promo = new PromoCode();
        promo.setCode("BIG");
        promo.setDiscountAmountMinor(999_999); // way more than subtotal
        promo.setActive(true);
        when(promoCodeRepository.findByCodeAndActiveTrue("BIG")).thenReturn(Optional.of(promo));

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "BIG");

        Order order = service.createOrder(command);

        assertThat(order.getSubtotalMinor()).isEqualTo(3_000);
        assertThat(order.getDiscountMinor()).isEqualTo(3_000); // capped at subtotal
        assertThat(order.getTotalMinor()).isZero(); // never negative
    }

    @Test
    void createOrder_invalidPromo_throws() {
        Product p = simpleProduct(10, 1_000);
        lenient().when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));
        when(promoCodeRepository.findByCodeAndActiveTrue("NOPE")).thenReturn(Optional.empty());

        CreateOrderCommand command = cmd(
                List.of(new CreateOrderCommand.Line(productUuid, null, 1)), "NOPE");

        assertThatThrownBy(() -> service.createOrder(command))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("invalid promo code");
    }

    // ---------- status transitions ----------

    private Order persistedOrder(OrderStatus status) {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        o.setStatus(status);
        o.setItems(new ArrayList<>());
        return o;
    }

    @Test
    void approve_thenShip_thenDeliver_setTimestamps() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        Order approved = service.approve(o.getId());
        assertThat(approved.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(approved.getApprovedAt()).isNotNull();

        Order shipped = service.ship(o.getId(), "TTN123");
        assertThat(shipped.getStatus()).isEqualTo(OrderStatus.SHIPPED);
        assertThat(shipped.getShippedAt()).isNotNull();
        assertThat(shipped.getTrackingNumber()).isEqualTo("TTN123");

        Order delivered = service.deliver(o.getId());
        assertThat(delivered.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        assertThat(delivered.getDeliveredAt()).isNotNull();

        verify(notificationService, times(3)).onStatusChanged(any(Order.class));
    }

    @Test
    void approve_nonNewOrder_throws() {
        Order o = persistedOrder(OrderStatus.SHIPPED);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.approve(o.getId()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("only NEW");
    }

    @Test
    void deliver_nonShippedOrder_throws() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.deliver(o.getId()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("only SHIPPED");
    }

    @Test
    void reject_restoresStockForProductAndVariant() {
        // order with one item referencing product+variant
        Order o = persistedOrder(OrderStatus.NEW);

        Product p = simpleProduct(2, 1_000);
        ProductVariant v = variant(p, 1);
        p.getVariants().add(v);

        OrderItem it = new OrderItem();
        it.setProductId(p.getId());
        it.setVariantId(v.getId());
        it.setQuantity(3);
        it.setTitleSnapshot("Test Product");
        o.getItems().add(it);

        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));
        when(productRepository.findByIdWithDetails(p.getId())).thenReturn(Optional.of(p));

        Order rejected = service.reject(o.getId(), "out of stock");

        assertThat(rejected.getStatus()).isEqualTo(OrderStatus.REJECTED);
        assertThat(rejected.getRejectedAt()).isNotNull();
        assertThat(rejected.getRejectReason()).isEqualTo("out of stock");
        assertThat(p.getStock()).isEqualTo(5); // 2 + 3 restored
        assertThat(v.getStock()).isEqualTo(4); // 1 + 3 restored
        verify(productRepository).save(p);
    }

    @Test
    void reject_alreadyRejected_throws() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.reject(o.getId(), "x"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("already rejected");
    }

    @Test
    void reject_deliveredOrder_throws() {
        Order o = persistedOrder(OrderStatus.DELIVERED);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> service.reject(o.getId(), "x"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("delivered orders cannot be rejected");
    }

    // ---------- changeStatus dispatcher ----------

    @Test
    void changeStatus_toNew_throwsInvalidTransition() {
        Order o = persistedOrder(OrderStatus.NEW);
        // findById not needed: NEW case throws before any lookup
        assertThatThrownBy(() -> service.changeStatus(o.getId(), OrderStatus.NEW, null, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("cannot transition back to NEW");
    }

    @Test
    void changeStatus_dispatchesToApprove() {
        Order o = persistedOrder(OrderStatus.NEW);
        when(orderRepository.findById(o.getId())).thenReturn(Optional.of(o));

        Order result = service.changeStatus(o.getId(), OrderStatus.APPROVED, null, null);

        assertThat(result.getStatus()).isEqualTo(OrderStatus.APPROVED);
        assertThat(result.getApprovedAt()).isNotNull();
    }
}
