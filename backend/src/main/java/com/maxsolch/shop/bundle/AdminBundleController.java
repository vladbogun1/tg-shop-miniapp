package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleRequest;
import com.maxsolch.shop.bundle.BundleDtos.StatsDto;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** «Вместе дешевле» in the admin: pairs of categories, a preview and the numbers. Settings — /api/admin/settings. */
@RestController
@RequestMapping("/api/admin/bundles")
@RequiredAdmin
@Tag(name = "Admin Bundles", description = "«Вместе дешевле»: category pairs, preview, stats")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBundleController {

    private final AdminBundleService service;

    public AdminBundleController(AdminBundleService service) {
        this.service = service;
    }

    @GetMapping("/rules")
    @Operation(summary = "All category pairs in their order")
    public List<RuleDto> rules() {
        return service.rules();
    }

    @PostMapping("/rules")
    @Operation(summary = "Add a pair «to a product of source offer products of target»")
    public RuleDto create(@RequestBody RuleRequest body) {
        return service.create(body);
    }

    @PatchMapping("/rules/{id}")
    @Operation(summary = "Change the order / switch a pair on or off")
    public RuleDto update(@PathVariable long id, @RequestBody RuleRequest body) {
        return service.update(id, body);
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "Delete a pair")
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @GetMapping("/preview")
    @Operation(summary = "What the customer sees next to a product (even while «Вместе дешевле» is off)")
    public ProductOfferDto preview(@RequestParam String productId) {
        return service.preview(productId);
    }

    @GetMapping("/case-items")
    @Operation(summary = "Prizes of the gift case with their current chances")
    public List<BundleDtos.CaseItemAdminDto> caseItems() {
        return service.caseItems();
    }

    @PostMapping("/case-items")
    @Operation(summary = "Add a prize to the gift case")
    public BundleDtos.CaseItemAdminDto addCaseItem(@RequestBody BundleDtos.CaseItemRequest body) {
        return service.addCaseItem(body);
    }

    @PatchMapping("/case-items/{id}")
    @Operation(summary = "Change rarity / weight / order / on-off of a prize")
    public BundleDtos.CaseItemAdminDto updateCaseItem(@PathVariable long id, @RequestBody BundleDtos.CaseItemRequest body) {
        return service.updateCaseItem(id, body);
    }

    @DeleteMapping("/case-items/{id}")
    @Operation(summary = "Remove a prize from the gift case")
    public void deleteCaseItem(@PathVariable long id) {
        service.deleteCaseItem(id);
    }

    @GetMapping("/stats")
    @Operation(summary = "Last 30 days: orders with the bundle discount, the discount given, gifts")
    public StatsDto stats() {
        return service.stats();
    }
}
