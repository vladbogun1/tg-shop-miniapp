package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.OrderPlacement;
import com.maxsolch.shop.platform.web.CurrentActor;
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

    private final OrderPlacement placement;
    private final CurrentActor actor;

    public OrderController(OrderPlacement placement, CurrentActor actor) {
        this.placement = placement;
        this.actor = actor;
    }

    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Place an order. Send an Idempotency-Key header to make retries safe.")
    public CreateOrderResponse create(
            @Valid @RequestBody CreateOrderRequest req,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        long userId = actor.userId();
        CreateOrderCommand draft = new CreateOrderCommand(
                userId,
                userId,
                null,
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
                null,
                req.giftChoice());
        OrderPlacement.Placed placed = placement.place(userId, actor.principal().isWeb(), idempotencyKey, draft);
        return new CreateOrderResponse(placed.orderId(), placed.amountDueMinor());
    }
}
