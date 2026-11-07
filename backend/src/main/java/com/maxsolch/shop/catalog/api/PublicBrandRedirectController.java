package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.app.BrandSlugHistory;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.Map;

/** Old brand slugs for the site's 301 (no authentication; the site's middleware calls it). */
@RestController
@RequestMapping("/api/public/brands")
@Tag(name = "Public site catalog", description = "Catalog for the public website: filters, slugs, sitemap")
public class PublicBrandRedirectController {

    private final BrandSlugHistory history;

    public PublicBrandRedirectController(BrandSlugHistory history) {
        this.history = history;
    }

    @GetMapping("/redirects")
    @Operation(summary = "Of the comma-separated brand slugs, those that are old ones: {oldSlug: currentSlug}")
    public Map<String, String> redirects(@RequestParam String slugs) {
        return history.resolve(Arrays.asList(slugs.split(",")));
    }
}
