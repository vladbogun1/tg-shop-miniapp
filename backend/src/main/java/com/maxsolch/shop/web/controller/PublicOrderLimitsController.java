package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.service.OrderGuard;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Order limits for the cart / checkout (quantity steppers, hints). Public: the site's cart works
 * before sign-in too. Values come from «Настройки» → «Защита от ботов и спама»; 0 = no limit.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public", description = "Public shop configuration")
public class PublicOrderLimitsController {

    private final OrderGuard guard;

    public PublicOrderLimitsController(OrderGuard guard) {
        this.guard = guard;
    }

    @GetMapping("/order-limits")
    @Operation(summary = "Anti-bot order limits (0 = no limit)")
    public OrderGuard.Limits limits() {
        return guard.limits();
    }
}
