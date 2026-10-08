package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.catalog.CatalogDtos.CatalogSchemaDto;
import com.maxsolch.shop.catalog.CatalogSchemaService;
import com.maxsolch.shop.service.PublicCatalogService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDetailDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.ProductCardPage;
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
    private final CatalogSchemaService schemaService;

    public PublicCatalogController(PublicCatalogService service, CatalogSchemaService schemaService) {
        this.service = service;
        this.schemaService = schemaService;
    }

    @GetMapping("/categories")
    @Operation(summary = "Menu categories (tree order, parentId/artKind, subtree counts) + virtual utsenka last")
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
    @Operation(summary = "Filtered, sorted, paginated products. category = slug (whole subtree) or utsenka "
            + "(condition != NEW); sort: default|price_asc|price_desc|new|name; all=1 = no paging (max 1000); "
            + "view=card = lightweight items (no description/SEO/tags, ≤ 2 images); unknown category slug → 404")
    public Object products(@RequestParam(required = false) String category,
                                @RequestParam(required = false) String q,
                                @RequestParam(required = false) Boolean inStock,
                                @RequestParam(required = false) Long priceMax,
                                @RequestParam(required = false) String sort,
                                @RequestParam(required = false) Integer page,
                                @RequestParam(required = false) Integer size,
                                @RequestParam(required = false) String all,
                                @RequestParam(required = false) String view,
                                Locale locale) {
        boolean everything = "1".equals(all) || "true".equalsIgnoreCase(all);
        ProductPage result = service.search(new PublicCatalogService.Query(category, q, inStock, priceMax, sort, page,
                size, everything), ContentLocale.normalize(locale));
        return "card".equalsIgnoreCase(view) ? ProductCardPage.of(result) : result;
    }

    @GetMapping("/catalog/schema")
    @Operation(summary = "Catalog schema (categories tree, brands, groups, characteristics, conditions), localized")
    public CatalogSchemaDto schema(Locale locale) {
        return schemaService.publicSchema(ContentLocale.normalize(locale));
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
