package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.catalog.app.ParcelSizes;
import com.maxsolch.shop.delivery.app.NovaPoshtaSenderService;
import com.maxsolch.shop.delivery.app.NovaPoshtaService;
import com.maxsolch.shop.delivery.app.NpSenderAdmin;
import com.maxsolch.shop.delivery.app.NpSenderAdmin.SenderResponse;
import com.maxsolch.shop.delivery.app.NpWarehouseDto;
import com.maxsolch.shop.delivery.app.ParcelSizeService;
import com.maxsolch.shop.delivery.domain.ParcelPacking;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin side of Nova Poshta that is not about one order: the sender (cabinet counterparty, contact, branches),
 * «Проверить ключ», box presets and the weight / box size of products and categories.
 */
@RestController
@RequestMapping("/api/admin/np")
@RequiredAdmin
@Tag(name = "Admin Nova Poshta", description = "Sender, API key check, parcel sizes")
@SecurityRequirement(name = "bearer-jwt")
public class AdminNovaPoshtaController {

    private final NpSenderAdmin sender;
    private final NovaPoshtaService directory;
    private final ParcelSizeService parcels;
    private final ParcelSizes sizes;

    public AdminNovaPoshtaController(NpSenderAdmin sender, NovaPoshtaService directory, ParcelSizeService parcels,
                                     ParcelSizes sizes) {
        this.sender = sender;
        this.directory = directory;
        this.parcels = parcels;
        this.sizes = sizes;
    }

    @GetMapping("/sender")
    @Operation(summary = "The configured sender (null until loaded from the cabinet)")
    public SenderResponse getSender() {
        return sender.current();
    }

    @PostMapping("/sender/load")
    @Operation(summary = "«Загрузить из кабинета НП»: counterparty + contact persons via the API")
    public SenderResponse loadSender() {
        return sender.loadFromCabinet();
    }

    @PutMapping("/sender")
    @Operation(summary = "Save the contact, phone and sending branches")
    public SenderResponse saveSender(@RequestBody NovaPoshtaSenderService.SenderConfig body) {
        return sender.save(body);
    }

    @PostMapping("/check-key")
    @Operation(summary = "«Проверить ключ»: one authorised call to Nova Poshta")
    public NovaPoshtaSenderService.KeyCheck checkKey() {
        return sender.checkKey();
    }

    @GetMapping("/warehouses")
    @Operation(summary = "Branches of a city (the sender branch picker)")
    public List<NpWarehouseDto> warehouses(@RequestParam String cityRef, @RequestParam(required = false) String q) {
        return directory.searchWarehouses(cityRef, q);
    }

    public record PresetsResponse(List<ParcelPacking.BoxPreset> presets) {
    }

    @GetMapping("/box-presets")
    @Operation(summary = "Boxes in stock (np_boxes) at every fold height; bags left out")
    public PresetsResponse presets() {
        return new PresetsResponse(parcels.presets());
    }

    @GetMapping("/size/products/{id}")
    @Operation(summary = "Weight / box of a product and its variants")
    public ParcelSizes.ProductSize productSize(@PathVariable String id) {
        return sizes.productSize(id);
    }

    @PutMapping("/size/products/{id}")
    @Operation(summary = "Save the weight / box of a product and its variants (null = inherit)")
    public ParcelSizes.ProductSize saveProductSize(@PathVariable String id,
                                                   @RequestBody ParcelSizes.ProductSize body) {
        return sizes.saveProductSize(id, body);
    }

    @GetMapping("/size/categories")
    @Operation(summary = "Weight / box of every category (defaults for its products)")
    public List<ParcelSizes.CategorySize> categorySizes() {
        return sizes.categorySizes();
    }

    @PutMapping("/size/categories/{id}")
    @Operation(summary = "Save the default weight / box of a category (null = inherit from the parent)")
    public ParcelSizes.CategorySize saveCategorySize(@PathVariable String id, @RequestBody ParcelSizes.Size body) {
        return sizes.saveCategorySize(id, body);
    }
}
