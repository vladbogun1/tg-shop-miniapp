package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.service.PublicCatalogService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDetailDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.ProductPage;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

/**
 * Read-only catalog for the public website (no authentication). Content language: {@code ?lang=}
 * (the site's server-side fetches send it) or Accept-Language; see ContentLocaleResolver.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public site catalog", description = "Catalog for the public website: filters, slugs, sitemap")
public class PublicCatalogController {

    private final PublicCatalogService service;

    public PublicCatalogController(PublicCatalogService service) {
        this.service = service;
    }

    @GetMapping("/categories")
    @Operation(summary = "Menu categories (tags with showInMenu) with active product counts")
    public List<CategoryDto> categories(Locale locale) {
        return service.categories(ContentLocale.normalize(locale));
    }

    @GetMapping("/categories/{slug}")
    @Operation(summary = "One category by slug with the SEO of its page (seoTitle, seoDescription, h1, "
            + "introText; null = site template), or 404")
    public ResponseEntity<CategoryDetailDto> category(@PathVariable String slug, Locale locale) {
        return service.category(slug, ContentLocale.normalize(locale))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/products")
    @Operation(summary = "Filtered, sorted, paginated products. sort: default|price_asc|price_desc|new|name; "
            + "unknown category slug → 404")
    public ProductPage products(@RequestParam(required = false) String category,
                                @RequestParam(required = false) String q,
                                @RequestParam(required = false) Boolean inStock,
                                @RequestParam(required = false) Long priceMax,
                                @RequestParam(required = false) String sort,
                                @RequestParam(required = false) Integer page,
                                @RequestParam(required = false) Integer size,
                                Locale locale) {
        return service.search(new PublicCatalogService.Query(category, q, inStock, priceMax, sort, page, size),
                ContentLocale.normalize(locale));
    }

    @GetMapping("/products/by-slug/{slug}")
    @Operation(summary = "Active product by its slug, or 404")
    public ResponseEntity<ProductDto> bySlug(@PathVariable String slug, Locale locale) {
        return service.bySlug(slug, ContentLocale.normalize(locale))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/sitemap")
    @Operation(summary = "Slugs for sitemap.xml")
    public SitemapDto sitemap() {
        return service.sitemap();
    }
}
