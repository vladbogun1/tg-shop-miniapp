package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.domain.CatalogErrors;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.catalog.app.AdminProductService;
import com.maxsolch.shop.catalog.app.AdminProducts;
import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.web.dto.BooleanFlagRequest;
import com.maxsolch.shop.catalog.app.ProductUpsertRequest;
import com.maxsolch.shop.media.app.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredAdmin
@Tag(name = "Admin Products", description = "Admin product management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminProductController {

    private final AdminProductService productService;
    private final AdminProducts products;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;

    public AdminProductController(AdminProductService productService, AdminProducts products,
                                  ImageStorageService imageStorageService, UploadValidator uploadValidator) {
        this.productService = productService;
        this.products = products;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
    }

    private static boolean flag(String v) {
        return v != null && (v.equals("1") || v.equalsIgnoreCase("true") || v.equalsIgnoreCase("yes"));
    }

    @GetMapping("/products")
    @Operation(summary = "List non-archived products; sort=demand puts the most waited-for first")
    public List<AdminProductDto> products(@RequestParam(required = false) String sort) {
        return productService.list(sort);
    }

    @GetMapping("/products/archived")
    @Operation(summary = "List archived products")
    public List<AdminProductDto> archived() {
        return productService.listArchived();
    }

    @PostMapping("/products")
    @Operation(summary = "Create product")
    public AdminProductDto create(@Valid @RequestBody ProductUpsertRequest req) {
        return products.create(req);
    }

    @PatchMapping("/products/{id}")
    @Operation(summary = "Update product (turning it active: 409 CARD_NOT_READY unless force=1, "
            + "409 PRODUCT_NOT_PUBLISHABLE {missing})")
    public AdminProductDto update(@PathVariable String id, @Valid @RequestBody ProductUpsertRequest req,
                                  @RequestParam(required = false) String force) {
        return products.update(id, req, flag(force));
    }

    @PatchMapping("/products/{id}/active")
    @Operation(summary = "Toggle product active (publishing a DRAFT card: 409 CARD_NOT_READY unless force=1; "
            + "no price/category: 409 PRODUCT_NOT_PUBLISHABLE {missing})")
    public AdminProductDto active(@PathVariable String id, @RequestBody BooleanFlagRequest body,
                                  @RequestParam(required = false) String force) {
        if (body.active() == null) {
            throw CatalogErrors.badRequest("active is required");
        }
        return products.setActive(id, body.active(), flag(force));
    }

    @PatchMapping("/products/{id}/archived")
    @Operation(summary = "Toggle product archived")
    public AdminProductDto archive(@PathVariable String id, @RequestBody BooleanFlagRequest body) {
        if (body.archived() == null) {
            throw CatalogErrors.badRequest("archived is required");
        }
        return products.setArchived(id, body.archived());
    }

    @PostMapping("/uploads")
    @Operation(summary = "Upload a product image (returns S3 key)")
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        uploadValidator.validateImage(file);
        return UploadResponse.ofKey(imageStorageService.uploadProductImage(file));
    }
}
