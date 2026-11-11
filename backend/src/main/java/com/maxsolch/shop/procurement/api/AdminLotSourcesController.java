package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiresFinance;
import com.maxsolch.shop.procurement.app.AdminLotSources;
import com.maxsolch.shop.procurement.app.CostingDtos.LotCostRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.LotSourceRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** «Склад по партиям» in a product card: where units came from and what the old stock cost. «Финансы» only. */
@RestController
@RequestMapping("/api/admin/costing")
@RequiredAdmin
@RequiresFinance
@Tag(name = "Admin Costing", description = "Batch money, FIFO cost of goods, margin")
@SecurityRequirement(name = "bearer-jwt")
public class AdminLotSourcesController {

    private final AdminLotSources sources;

    public AdminLotSourcesController(AdminLotSources sources) {
        this.sources = sources;
    }

    @PutMapping("/lots/{lotId}/cost")
    @Operation(summary = "Purchase + delivery per unit of an old-stock / hand-added lot; purchase null clears it")
    public ProductCostDto setLotCost(@PathVariable long lotId, @RequestBody LotCostRequest req) {
        return sources.setLotCost(lotId, req);
    }

    @PostMapping("/products/{productId}/lot-source")
    @Operation(summary = "Units without a cost came from an arrived batch line, or get a typed purchase + delivery")
    public ProductCostDto assign(@PathVariable String productId, @RequestBody LotSourceRequest req) {
        return sources.assign(productId, req);
    }
}
