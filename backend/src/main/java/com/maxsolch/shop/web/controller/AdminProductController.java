package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.MoneyFormat;
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
     * its category path (leaf and parent) and «Уценка» — and, after an edit, the path and slug it had
     * before, or a product moved out of a category kept showing there until ISR expiry.
     */
    private AdminProductDto revalidated(AdminProductDto p, AdminProductDto before) {
        java.util.Set<String> categories = new java.util.LinkedHashSet<>(pathSlugs(p));
        if (before != null) {
            categories.addAll(pathSlugs(before));
        }
        if (!"NEW".equals(p.condition()) || (before != null && !"NEW".equals(before.condition()))) {
            categories.add(com.maxsolch.shop.catalog.MarkdownCollection.SLUG);
        }
        siteRevalidator.productChanged(p.slug(), before == null ? null : before.slug(), categories);
        return p;
    }

    /** The category path root → leaf ({@code tags} carries it). */
    private static List<String> pathSlugs(AdminProductDto p) {
        return p.tags() == null ? List.of() : p.tags().stream().map(t -> t.slug()).toList();
    }

    private static boolean flag(String v) {
        return v != null && (v.equals("1") || v.equalsIgnoreCase("true") || v.equalsIgnoreCase("yes"));
    }

    /** "категория A → B, бренд X → Y, состояние NEW → MARKDOWN, характеристики: +3, ~2, −1". */
    static String catalogSummary(AdminProductDto before, AdminProductDto after) {
        StringBuilder sb = new StringBuilder();
        if (before == null) {
            return "";
        }
        if (!java.util.Objects.equals(before.categoryId(), after.categoryId())) {
            sb.append(", категория ").append(pathName(before)).append(" → ").append(pathName(after));
        }
        if (!java.util.Objects.equals(before.brand(), after.brand())) {
            sb.append(", бренд ").append(before.brand() == null ? "—" : before.brand()).append(" → ")
                    .append(after.brand() == null ? "—" : after.brand());
        }
        if (!java.util.Objects.equals(before.condition(), after.condition())) {
            sb.append(", состояние ").append(before.condition()).append(" → ").append(after.condition());
        }
        java.util.Map<String, Object> a = before.specs() == null ? java.util.Map.of() : before.specs();
        java.util.Map<String, Object> b = after.specs() == null ? java.util.Map.of() : after.specs();
        int added = 0;
        int changed = 0;
        int removed = 0;
        for (var e : b.entrySet()) {
            if (!a.containsKey(e.getKey())) {
                added++;
            } else if (!java.util.Objects.equals(String.valueOf(a.get(e.getKey())), String.valueOf(e.getValue()))) {
                changed++;
            }
        }
        for (String k : a.keySet()) {
            if (!b.containsKey(k)) {
                removed++;
            }
        }
        if (added + changed + removed > 0) {
            sb.append(", характеристики: +").append(added).append(", ~").append(changed).append(", −").append(removed);
        }
        if (!java.util.Objects.equals(before.cardStatus(), after.cardStatus())) {
            sb.append(", карточка ").append(before.cardStatus()).append(" → ").append(after.cardStatus());
        }
        return sb.toString();
    }

    private static String pathName(AdminProductDto p) {
        return p.tags() == null || p.tags().isEmpty() ? "—"
                : String.join(" › ", p.tags().stream().map(t -> t.name()).toList());
    }

    /** "цена 1 200 ₴ → 900 ₴, сток 3 → 5" — only what changed among the money/stock/visibility fields. */
    static String changeSummary(AdminProductDto before, AdminProductDto after) {
        StringBuilder sb = new StringBuilder(after.title());
        if (before == null) {
            return sb.append(", цена ").append(MoneyFormat.uah(after.priceMinor())).append(", сток ").append(after.stock())
                    .toString();
        }
        if (before.priceMinor() != after.priceMinor()) {
            sb.append(", цена ").append(MoneyFormat.uah(before.priceMinor())).append(" → ")
                    .append(MoneyFormat.uah(after.priceMinor()));
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
    @Operation(summary = "Update product (turning it active: 409 CARD_NOT_READY unless force=1, "
            + "409 PRODUCT_NOT_PUBLISHABLE {missing})")
    public AdminProductDto update(@PathVariable String id, @Valid @RequestBody ProductUpsertRequest req,
                                  @RequestParam(required = false) String force) {
        // Read before the save: the journal shows what changed, the site rebuilds the old slug and
        // the categories the product is leaving.
        AdminProductDto before = productService.get(id);
        AdminProductDto updated = productService.update(id, req, flag(force));
        audit.record("PRODUCT_UPDATE", "PRODUCT", id, changeSummary(before, updated) + catalogSummary(before, updated)
                + (flag(force) && !before.active() && updated.active() ? ", выложен без оформления" : ""));
        return revalidated(updated, before);
    }

    @PatchMapping("/products/{id}/active")
    @Operation(summary = "Toggle product active (publishing a DRAFT card: 409 CARD_NOT_READY unless force=1; "
            + "no price/category: 409 PRODUCT_NOT_PUBLISHABLE {missing})")
    public AdminProductDto active(@PathVariable String id, @RequestBody BooleanFlagRequest body,
                                  @RequestParam(required = false) String force) {
        if (body.active() == null) {
            throw new BadRequestException("active is required");
        }
        AdminProductDto saved = productService.setActive(id, body.active(), flag(force));
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
