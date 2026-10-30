package com.maxsolch.shop.site.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import org.springframework.stereotype.Service;

/**
 * The admin's manual «Обновить сайт»: rebuilds every page of the public site now and journals the outcome. Not
 * {@code @Transactional}: the audit entry is written on its own.
 */
@Service
public class AdminSite {

    /** Result of a manual rebuild. {@code error} is null on success. */
    public record RevalidateResult(boolean ok, String error, SiteRevalidator.Status status) {
    }

    private final SiteRevalidator siteRevalidator;
    private final AdminAuditService audit;

    public AdminSite(SiteRevalidator siteRevalidator, AdminAuditService audit) {
        this.siteRevalidator = siteRevalidator;
        this.audit = audit;
    }

    public RevalidateResult revalidate() {
        String error = siteRevalidator.revalidateAllNow();
        audit.record("SITE_REVALIDATE", "SITE", null, error == null ? "сайт обновлён" : "ошибка: " + error);
        return new RevalidateResult(error == null, error, siteRevalidator.status());
    }
}
