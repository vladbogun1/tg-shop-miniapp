package com.maxsolch.shop.procurement.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.procurement.app.SupplierAliases;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasDto;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasesRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** «Поставка с ИИ»: the supplier memory — which product of ours a line of the supplier's document is. */
@RestController
@RequestMapping("/api/admin/preorders/suppliers/{supplierId}/aliases")
@RequiredAdmin
@Tag(name = "Admin Preorders", description = "Supply batches, pre-order queues and demand")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSupplierAliasController {

    private final SupplierAliases aliases;

    public AdminSupplierAliasController(SupplierAliases aliases) {
        this.aliases = aliases;
    }

    @GetMapping
    @Operation(summary = "Supplier memory: line text → product")
    public List<AliasDto> aliases(@PathVariable long supplierId) {
        return aliases.of(supplierId);
    }

    @PutMapping
    @Operation(summary = "Remember confirmed lines of a supplier (insert or overwrite)")
    public List<AliasDto> save(@PathVariable long supplierId, @RequestBody AliasesRequest req) {
        return aliases.save(supplierId, req);
    }
}
