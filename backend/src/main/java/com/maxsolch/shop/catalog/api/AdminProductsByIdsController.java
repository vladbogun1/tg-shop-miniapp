package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.AdminProductsByIds;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** A few products by id — for screens that need only them (a supply's rows, the gift field), not the whole catalog. */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Products", description = "Admin product management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminProductsByIdsController {

    private final AdminProductsByIds byIds;

    public AdminProductsByIdsController(AdminProductsByIds byIds) {
        this.byIds = byIds;
    }

    @GetMapping("/products/by-ids")
    @Operation(summary = "Products by id (comma-separated, at most 200), archived ones too; unknown ids are skipped")
    public List<AdminProductDto> byIds(@RequestParam List<String> ids) {
        return byIds.byIds(ids);
    }
}
