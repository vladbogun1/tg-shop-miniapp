package com.maxsolch.shop.site.api;

import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.site.app.AdminSite;
import com.maxsolch.shop.site.app.SiteRevalidator;
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

    private final AdminSite admin;
    private final SiteRevalidator siteRevalidator;

    public AdminSiteController(AdminSite admin, SiteRevalidator siteRevalidator) {
        this.admin = admin;
        this.siteRevalidator = siteRevalidator;
    }

    @PostMapping("/revalidate")
    @Operation(summary = "Rebuild every page of the public site now; reports the site's answer")
    public AdminSite.RevalidateResult revalidate() {
        return admin.revalidate();
    }

    @GetMapping("/revalidate/status")
    @Operation(summary = "Whether revalidation is configured, last success and last error (with time)")
    public SiteRevalidator.Status status() {
        return siteRevalidator.status();
    }
}
