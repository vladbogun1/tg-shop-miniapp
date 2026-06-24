package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.PaymentRequisites;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.repository.PaymentRequisitesRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.service.CreateOrderCommand;
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

    public OrderController(OrderService orderService, UserRepository userRepository,
                           PaymentRequisitesRepository requisitesRepository) {
        this.orderService = orderService;
        this.userRepository = userRepository;
        this.requisitesRepository = requisitesRepository;
    }

    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Place an order")
    public CreateOrderResponse create(@Valid @RequestBody CreateOrderRequest req) {
        long userId = SecurityUtil.currentUserId();
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
        PaymentRequisitesDto requisites = requisitesRepository.findById(1)
                .map(OrderController::toReqDto)
                .orElse(null);
        return new CreateOrderResponse(UuidUtil.toString(order.getId()), requisites);
    }

    private static PaymentRequisitesDto toReqDto(PaymentRequisites r) {
        return new PaymentRequisitesDto(r.getCardNumber(), r.getIban(), r.getRecipient(),
                r.getEdrpou(), r.getPurpose(), r.getNote());
    }
}
