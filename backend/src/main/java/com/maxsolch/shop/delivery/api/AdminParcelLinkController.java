package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.LinkedParcelView;
import com.maxsolch.shop.delivery.app.LinkedParcels;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The waybills NP made on the basis of an order's parcel: return to us, redirect, return after pickup (V103). */
@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin shipments", description = "Nova Poshta waybills and labels")
@SecurityRequirement(name = "bearer-jwt")
public class AdminParcelLinkController {

    private final LinkedParcels linked;

    public AdminParcelLinkController(LinkedParcels linked) {
        this.linked = linked;
    }

    @GetMapping("/orders/{id}/parcel-links")
    @Operation(summary = "Linked Nova Poshta waybills of the order (return, redirect), oldest first")
    public List<LinkedParcelView> links(@PathVariable String id) {
        return linked.views(id);
    }
}
