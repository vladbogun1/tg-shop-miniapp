package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.AdminProductService;
import com.maxsolch.shop.site.SiteRevalidator;
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
    private final SiteRevalidator siteRevalidator;

    public AdminProductController(AdminProductService productService,
                                  ImageStorageService imageStorageService,
                                  UploadValidator uploadValidator,
                                  AdminAuditService audit,
                                  SiteRevalidator siteRevalidator) {
        this.productService = productService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    /**
     * Rebuild the site pages this product appears on (no-op when revalidation is off): its page,
     * its categories — and, after an edit, the categories and slug it had before, or a product
     * moved out of a category kept showing in that category's listing until ISR expiry.
     */
    private AdminProductDto revalidated(AdminProductDto p, AdminProductDto before) {
        java.util.Set<String> categories = new java.util.LinkedHashSet<>(tagSlugs(p));
        if (before != null) {
            categories.addAll(tagSlugs(before));
        }
        siteRevalidator.productChanged(p.slug(), before == null ? null : before.slug(), categories);
        return p;
    }

    private static List<String> tagSlugs(AdminProductDto p) {
        return p.tags() == null ? List.of() : p.tags().stream().map(t -> t.slug()).toList();
    }

    /** "цена 1200 → 900, сток 3 → 5" — only what changed among the money/stock/visibility fields. */
    static String changeSummary(AdminProductDto before, AdminProductDto after) {
        StringBuilder sb = new StringBuilder(after.title());
        if (before == null) {
            return sb.append(", price ").append(after.priceMinor()).append(", stock ").append(after.stock())
                    .toString();
        }
        if (before.priceMinor() != after.priceMinor()) {
            sb.append(", цена ").append(before.priceMinor()).append(" → ").append(after.priceMinor());
        }
        if (before.stock() != after.stock()) {
            sb.append(", сток ").append(before.stock()).append(" → ").append(after.stock());
        }
        if (before.active() != after.active()) {
            sb.append(after.active() ? ", показан" : ", скрыт");
        }
        if (!java.util.Objects.equals(before.title(), after.title())) {
            sb.append(", было «").append(before.title()).append('»');
        }
        return sb.toString();
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
        return revalidated(created, null);
    }

    @PatchMapping("/products/{id}")
    @Operation(summary = "Update product")
    public AdminProductDto update(@PathVariable String id, @Valid @RequestBody ProductUpsertRequest req) {
        // Read before the save: the journal shows what changed, the site rebuilds the old slug and
        // the categories the product is leaving.
        AdminProductDto before = productService.get(id);
        AdminProductDto updated = productService.update(id, req);
        audit.record("PRODUCT_UPDATE", "PRODUCT", id, changeSummary(before, updated));
        return revalidated(updated, before);
    }

    @PatchMapping("/products/{id}/active")
    @Operation(summary = "Toggle product active")
    public AdminProductDto active(@PathVariable String id, @RequestBody BooleanFlagRequest body) {
        if (body.active() == null) {
            throw new BadRequestException("active is required");
        }
        AdminProductDto saved = productService.setActive(id, body.active());
        // Journal after the fact: a 404 must not leave a "показан" entry for something that never happened.
        audit.record("PRODUCT_ACTIVE", "PRODUCT", id, body.active() ? "показан" : "скрыт");
        return revalidated(saved, null);
    }

    @PatchMapping("/products/{id}/archived")
    @Operation(summary = "Toggle product archived")
    public AdminProductDto archive(@PathVariable String id, @RequestBody BooleanFlagRequest body) {
        if (body.archived() == null) {
            throw new BadRequestException("archived is required");
        }
        AdminProductDto saved = productService.setArchived(id, body.archived());
        audit.record("PRODUCT_ARCHIVE", "PRODUCT", id, body.archived() ? "в архив" : "из архива");
        return revalidated(saved, null);
    }

    @PostMapping("/uploads")
    @Operation(summary = "Upload a product image (returns S3 key)")
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        uploadValidator.validateImage(file);
        return UploadResponse.ofKey(imageStorageService.uploadProductImage(file));
    }
}
