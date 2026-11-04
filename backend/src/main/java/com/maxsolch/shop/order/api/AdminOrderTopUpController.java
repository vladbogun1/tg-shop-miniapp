package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderTopUp;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** How the top-up of a paid online order is taken: online, наложкой on delivery, or not at all. */
@RestController
@RequestMapping("/api/admin/orders/{id}/top-up")
@RequiredAdmin
@Tag(name = "Admin Order Top-up", description = "The rest of a paid order that got more expensive after the payment")
@SecurityRequirement(name = "bearer-jwt")
public class AdminOrderTopUpController {

    private final OrderTopUp topUp;
    private final OrderQueryService orderQueryService;

    public AdminOrderTopUpController(OrderTopUp topUp, OrderQueryService orderQueryService) {
        this.topUp = topUp;
        this.orderQueryService = orderQueryService;
    }

    public record TopUpRequest(@NotNull OrderTopUp.Mode mode) {
    }

    @PostMapping
    @Operation(summary = "ONLINE — the customer pays in the order (default); ON_DELIVERY — наложкой; WAIVE — a discount for it")
    public OrderDetailDto choose(@PathVariable String id, @Valid @RequestBody TopUpRequest req) {
        return orderQueryService.toDetail(topUp.choose(id, req.mode()));
    }
}
