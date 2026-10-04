package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.site.SiteRevalidator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public site's on-demand rebuild, from the admin panel: a manual «Обновить сайт» and the
 * outcome of the last automatic call (product/category/translation/payment edits trigger those),
 * which used to be visible only in the server log.
 */
@RestController
@RequestMapping("/api/admin/site")
@RequiredAdmin
@Tag(name = "Admin Site", description = "Public site revalidation")
@SecurityRequirement(name = "bearer-jwt")
public class AdminSiteController {

    /** Result of a manual rebuild. {@code error} is null on success. */
    public record RevalidateResult(boolean ok, String error, SiteRevalidator.Status status) {
    }

    private final SiteRevalidator siteRevalidator;
    private final AdminAuditService audit;

    public AdminSiteController(SiteRevalidator siteRevalidator, AdminAuditService audit) {
        this.siteRevalidator = siteRevalidator;
        this.audit = audit;
    }

    @PostMapping("/revalidate")
    @Operation(summary = "Rebuild every page of the public site now; reports the site's answer")
    public RevalidateResult revalidate() {
        String error = siteRevalidator.revalidateAllNow();
        audit.record("SITE_REVALIDATE", "SITE", null, error == null ? "сайт обновлён" : "ошибка: " + error);
        return new RevalidateResult(error == null, error, siteRevalidator.status());
    }

    @GetMapping("/revalidate/status")
    @Operation(summary = "Whether revalidation is configured, last success and last error (with time)")
    public SiteRevalidator.Status status() {
        return siteRevalidator.status();
    }
}
