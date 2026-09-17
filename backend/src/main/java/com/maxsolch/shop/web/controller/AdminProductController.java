package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.AdminProductService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.BooleanFlagRequest;
import com.maxsolch.shop.web.dto.ProductUpsertRequest;
import com.maxsolch.shop.web.dto.UploadResponse;
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
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;
    private final AdminAuditService audit;

    public AdminProductController(AdminProductService productService,
                                  ImageStorageService imageStorageService,
                                  UploadValidator uploadValidator,
                                  AdminAuditService audit) {
        this.productService = productService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.audit = audit;
    }

    @GetMapping("/products")
    @Operation(summary = "List non-archived products")
    public List<AdminProductDto> products() {
        return productService.list();
    }

    @GetMapping("/products/archived")
    @Operation(summary = "List archived products")
    public List<AdminProductDto> archived() {
        return productService.listArchived();
    }

    @PostMapping("/products")
    @Operation(summary = "Create product")
    public AdminProductDto create(@Valid @RequestBody ProductUpsertRequest req) {
        AdminProductDto created = productService.create(req);
        audit.record("PRODUCT_CREATE", "PRODUCT", created.id(), created.title());
        return created;
    }

    @PatchMapping("/products/{id}")
    @Operation(summary = "Update product")
    public AdminProductDto update(@PathVariable String id, @Valid @RequestBody ProductUpsertRequest req) {
        AdminProductDto updated = productService.update(id, req);
        audit.record("PRODUCT_UPDATE", "PRODUCT", id,
                updated.title() + ", price " + updated.priceMinor() + ", stock " + updated.stock());
        return updated;
    }

    @PatchMapping("/products/{id}/active")
    @Operation(summary = "Toggle product active")
    public AdminProductDto active(@PathVariable String id, @RequestBody BooleanFlagRequest body) {
        if (body.active() == null) {
            throw new BadRequestException("active is required");
        }
        audit.record("PRODUCT_ACTIVE", "PRODUCT", id, body.active() ? "показан" : "скрыт");
        return productService.setActive(id, body.active());
    }

    @PatchMapping("/products/{id}/archived")
    @Operation(summary = "Toggle product archived")
    public AdminProductDto archive(@PathVariable String id, @RequestBody BooleanFlagRequest body) {
        if (body.archived() == null) {
            throw new BadRequestException("archived is required");
        }
        audit.record("PRODUCT_ARCHIVE", "PRODUCT", id, body.archived() ? "в архив" : "из архива");
        return productService.setArchived(id, body.archived());
    }

    @PostMapping("/uploads")
    @Operation(summary = "Upload a product image (returns S3 key)")
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        uploadValidator.validateImage(file);
        return UploadResponse.ofKey(imageStorageService.uploadProductImage(file));
    }
}
