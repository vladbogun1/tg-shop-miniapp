package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.service.CreateOrderCommand;
import com.maxsolch.shop.service.OrderIdempotencyService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.CreateOrderRequest;
import com.maxsolch.shop.web.dto.CreateOrderResponse;
import com.maxsolch.shop.web.dto.PaymentRequisitesDto;
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
    private final PaymentRequisitesRepository requisitesRepository;
    private final OrderIdempotencyService idempotency;

    public OrderController(OrderService orderService, UserRepository userRepository,
                           PaymentRequisitesRepository requisitesRepository,
                           OrderIdempotencyService idempotency) {
        this.orderService = orderService;
        this.userRepository = userRepository;
        this.requisitesRepository = requisitesRepository;
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
            return new CreateOrderResponse(existingOrderId, requisitesDto());
        }

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
                req.paymentOptionId());
        Order order = orderService.createOrder(cmd);
        String orderId = UuidUtil.toString(order.getId());
        idempotency.remember(userId, idempotencyKey, orderId);
        return new CreateOrderResponse(orderId, requisitesDto());
    }

    /** Shop requisites for the success screen, so it needs no second round trip. */
    private PaymentRequisitesDto requisitesDto() {
        return requisitesRepository.findById(1)
                .map(OrderController::toReqDto)
                .orElse(null);
    }

    private static PaymentRequisitesDto toReqDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }
}
