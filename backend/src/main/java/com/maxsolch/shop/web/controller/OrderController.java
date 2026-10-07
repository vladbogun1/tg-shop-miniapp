package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderSource;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.service.CreateOrderCommand;
import com.maxsolch.shop.service.OrderIdempotencyService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.CreateOrderRequest;
import com.maxsolch.shop.web.dto.CreateOrderResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Customer order placement")
@SecurityRequirement(name = "bearer-jwt")
public class OrderController {

    private final OrderService orderService;
    private final UserRepository userRepository;
    private final OrderIdempotencyService idempotency;
    @org.springframework.beans.factory.annotation.Autowired
    private com.maxsolch.shop.service.OrderGuard orderGuard;

    public OrderController(OrderService orderService, UserRepository userRepository,
                           OrderIdempotencyService idempotency) {
        this.orderService = orderService;
        this.userRepository = userRepository;
        this.idempotency = idempotency;
    }

    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Place an order. Send an Idempotency-Key header to make retries safe.")
    public CreateOrderResponse create(
            @Valid @RequestBody CreateOrderRequest req,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        long userId = SecurityUtil.currentUserId();

        // A retried checkout (lost response, double tap) must not become a second order with a
        // second stock deduction — return the one already created under this key.
        String existingOrderId = idempotency.previousOrderId(userId, idempotencyKey);
        if (existingOrderId != null) {
            return new CreateOrderResponse(existingOrderId,
                    OrderService.amountDueMinor(orderService.get(UuidUtil.toBytes(existingOrderId))));
        }

        // Anti-bot / anti-hoarding limits (settings «Защита от ботов и спама»): 400/429 with a code.
        orderGuard.check(userId, req.items().stream()
                .map(i -> new CreateOrderCommand.Line(i.productId(), i.variantId(), i.quantity()))
                .toList());

        // Snapshot the customer's Telegram @username (from the users row, populated at auth)
        // so the admin order card can deep-link to their Telegram DM.
        String tgUsername = userRepository.findById(userId).map(User::getUsername).orElse(null);
        CreateOrderCommand cmd = new CreateOrderCommand(
                userId,
                userId,
                tgUsername,
                req.items().stream()
                        .map(i -> new CreateOrderCommand.Line(i.productId(), i.variantId(), i.quantity()))
                        .toList(),
                req.customerName(),
                req.phone(),
                req.comment(),
                req.promoCode(),
                req.deliveryMethod(),
                req.npCityRef(),
                req.npCityName(),
                req.npWarehouseRef(),
                req.npWarehouseName(),
                req.paymentOptionId(),
                // A site token (cookie, chn=web) marks the order as placed on the website.
                SecurityUtil.currentPrincipal().isWeb() ? OrderSource.WEB : OrderSource.MINIAPP);
        Order order = orderService.createOrder(cmd);
        String orderId = UuidUtil.toString(order.getId());
        idempotency.remember(userId, idempotencyKey, orderId);
        // Next step for the app: POST /api/me/orders/{id}/payment → monobank payment page.
        return new CreateOrderResponse(orderId, OrderService.amountDueMinor(order));
    }
}
