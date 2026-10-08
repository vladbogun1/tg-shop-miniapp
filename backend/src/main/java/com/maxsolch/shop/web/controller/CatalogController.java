package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.catalog.CatalogDtos.CatalogSchemaDto;
import com.maxsolch.shop.catalog.CatalogSchemaService;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.dto.ProductDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api")
@Tag(name = "Catalog", description = "Public catalog (Mini App products)")
// Content language: Accept-Language, or ?lang=uk|ru|en (wins) — titles/descriptions/variant names
// are translated for uk/en when a current translation exists (docs/CONTENT-I18N.md).
public class CatalogController {

    private final CatalogService catalogService;
    private final CatalogSchemaService schemaService;

    public CatalogController(CatalogService catalogService, CatalogSchemaService schemaService) {
        this.catalogService = catalogService;
        this.schemaService = schemaService;
    }

    @GetMapping("/catalog/schema")
    @Operation(summary = "Catalog schema for the Mini App (categories, brands, characteristics), localized")
    public CatalogSchemaDto schema(Locale locale) {
        return schemaService.publicSchema(ContentLocale.normalize(locale));
    }

    @GetMapping("/products")
    @Operation(summary = "List active, non-archived products")
    public List<ProductDto> products(Locale locale) {
        return catalogService.listActiveProducts(ContentLocale.normalize(locale));
    }

    @GetMapping("/products/{id}")
    @Operation(summary = "Get a single active product by UUID")
    public ResponseEntity<ProductDto> product(@PathVariable String id, Locale locale) {
        return catalogService.getProduct(id, ContentLocale.normalize(locale))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
