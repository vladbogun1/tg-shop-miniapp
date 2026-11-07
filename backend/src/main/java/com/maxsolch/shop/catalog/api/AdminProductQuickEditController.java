package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.AdminProducts;
import com.maxsolch.shop.catalog.app.ProductQuickEditRequest;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/products")
@RequiredAdmin
@Tag(name = "Admin Products", description = "Admin product management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminProductQuickEditController {

    private final AdminProducts products;

    public AdminProductQuickEditController(AdminProducts products) {
        this.products = products;
    }

    @PatchMapping("/{id}/quick")
    @Operation(summary = "Quick edit from the list: price and/or stock only. 409 STOCK_CONFLICT / PRICE_CONFLICT when the "
            + "stored value is no longer the expected one; 400 STOCK_REASON_REQUIRED when the stock goes down; "
            + "400 QUICK_STOCK_HAS_VARIANTS for a product with variants")
    public AdminProductDto quick(@PathVariable String id, @Valid @RequestBody ProductQuickEditRequest req) {
        return products.quickEdit(id, req);
    }
}
