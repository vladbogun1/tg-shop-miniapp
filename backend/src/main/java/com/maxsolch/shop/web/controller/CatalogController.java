package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.TagDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Catalog", description = "Public catalog (products & tags)")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/products")
    @Operation(summary = "List active, non-archived products")
    public List<ProductDto> products() {
        return catalogService.listActiveProducts();
    }

    @GetMapping("/products/{id}")
    @Operation(summary = "Get a single active product by UUID")
    public ResponseEntity<ProductDto> product(@PathVariable String id) {
        return catalogService.getProduct(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/tags")
    @Operation(summary = "List all tags")
    public List<TagDto> tags() {
        return catalogService.listTags();
    }
}
