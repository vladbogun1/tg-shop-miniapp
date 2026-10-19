package com.maxsolch.shop.bundle;

import com.maxsolch.shop.bundle.BundleDtos.AutoTuneDto;
import com.maxsolch.shop.bundle.BundleDtos.ForecastDto;
import com.maxsolch.shop.bundle.BundleDtos.FunnelDto;
import com.maxsolch.shop.bundle.BundleDtos.MarginDto;
import com.maxsolch.shop.bundle.BundleDtos.MarginRequest;
import com.maxsolch.shop.bundle.BundleDtos.PairStatDto;
import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleRequest;
import com.maxsolch.shop.bundle.BundleDtos.SetupRuleDto;
import com.maxsolch.shop.bundle.BundleDtos.StatsDto;
import com.maxsolch.shop.bundle.BundleDtos.WarningDto;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * «Вместе дешевле» in the admin: pairs of categories, «Собери сетап», margins, a preview and the
 * numbers (funnel, pairs from orders, auto-tune, forecast, warnings). Settings — /api/admin/settings.
 */
@RestController
@RequestMapping("/api/admin/bundles")
@RequiredAdmin
@Tag(name = "Admin Bundles", description = "«Вместе дешевле»: category pairs, setup, margins, preview, stats")
@SecurityRequirement(name = "bearer-jwt")
public class AdminBundleController {

    private final AdminBundleService service;
    private final BundleInsightsService insights;

    public AdminBundleController(AdminBundleService service, BundleInsightsService insights) {
        this.service = service;
        this.insights = insights;
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

    @GetMapping("/setup-rules")
    @Operation(summary = "«Собери сетап»: pairs of big items")
    public List<SetupRuleDto> setupRules() {
        return service.setupRules();
    }

    @PostMapping("/setup-rules")
    @Operation(summary = "Add a «Собери сетап» pair")
    public SetupRuleDto createSetup(@RequestBody RuleRequest body) {
        return service.createSetup(body);
    }

    @PatchMapping("/setup-rules/{id}")
    @Operation(summary = "Change the order / switch a «Собери сетап» pair on or off")
    public SetupRuleDto updateSetup(@PathVariable long id, @RequestBody RuleRequest body) {
        return service.updateSetup(id, body);
    }

    @DeleteMapping("/setup-rules/{id}")
    @Operation(summary = "Delete a «Собери сетап» pair")
    public void deleteSetup(@PathVariable long id) {
        service.deleteSetup(id);
    }

    @GetMapping("/margins")
    @Operation(summary = "Margins of the categories and the discount caps they give")
    public List<MarginDto> margins() {
        return service.margins();
    }

    @PutMapping("/margins")
    @Operation(summary = "Set the margin / the manual discount of a category (null clears)")
    public List<MarginDto> saveMargin(@RequestBody MarginRequest body) {
        return service.saveMargin(body);
    }

    @GetMapping("/preview")
    @Operation(summary = "What the customer sees next to a product, with the score factors "
            + "(even while «Вместе дешевле» is off)")
    public ProductOfferDto preview(@RequestParam String productId) {
        return service.preview(productId);
    }

    @GetMapping("/stats")
    @Operation(summary = "Last 30 days: orders with the bundle discount, the discount given")
    public StatsDto stats() {
        return service.stats();
    }

    @GetMapping("/funnel")
    @Operation(summary = "Last 30 days: the block vs the control group, adds by slot")
    public FunnelDto funnel() {
        return insights.funnel();
    }

    @GetMapping("/pairs")
    @Operation(summary = "Top categories bought together (180 days), suggested missing pairs")
    public List<PairStatDto> pairs() {
        return insights.pairs();
    }

    @PostMapping("/autotune")
    @Operation(summary = "Recompute the discounts from the margins and the response now")
    public AutoTuneDto autoTune() {
        return insights.autoTune();
    }

    @GetMapping("/forecast")
    @Operation(summary = "A month ahead in three scenarios")
    public ForecastDto forecast() {
        return insights.forecast();
    }

    @GetMapping("/warnings")
    @Operation(summary = "What needs attention: sold-out hits, products without accessories, zero caps")
    public List<WarningDto> warnings() {
        return insights.warnings();
    }
}
