package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.PromoOrdersView;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The order side of the promo-code admin pages: the URLs are under {@code /api/admin/promocodes} as before, the
 * handlers live here because they are about orders (the promo module does not import order).
 */
@RestController
@RequestMapping("/api/admin/promocodes")
@RequiredAdmin
@Tag(name = "Admin Promocodes", description = "Admin promo-code management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPromoOrdersController {

    private final PromoOrdersView view;

    public AdminPromoOrdersController(PromoOrdersView view) {
        this.view = view;
    }

    @GetMapping("/manual-discounts")
    @Operation(summary = "Orders with a manual amount/percent discount, newest first (max 200)")
    public List<PromoOrdersView.ManualDiscountDto> manualDiscounts() {
        return view.manualDiscounts();
    }

    @GetMapping("/{id}/orders")
    @Operation(summary = "Orders placed with this code, newest first (max 100)")
    public List<PromoOrdersView.PromoOrderDto> orders(@PathVariable String id) {
        return view.ordersWithCode(id);
    }
}
