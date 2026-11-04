package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.catalog.app.ProductPhotoImport;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/products")
@RequiredAdmin
@Tag(name = "Admin Products", description = "Admin product management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminProductPhotoController {

    /** A picture's or product page's link. */
    public record PhotoImportRequest(@NotBlank @Size(max = 2048) String url) {
    }

    private final ProductPhotoImport photoImport;

    public AdminProductPhotoController(ProductPhotoImport photoImport) {
        this.photoImport = photoImport;
    }

    @PostMapping("/{id}/photos/import")
    @Operation(summary = "Download a photo by link, square it to 1600 px WebP on its own edge colour and add it last")
    public ProductPhotoImport.Result importPhoto(@PathVariable String id, @Valid @RequestBody PhotoImportRequest req) {
        return photoImport.importPhoto(id, req.url());
    }
}
