package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * What the admin does with a product, one method per button: runs {@link AdminProductService}, writes the audit entry
 * after its transaction has committed and rebuilds the site pages the product appears on. The controller only turns
 * the request into these arguments. Not {@code @Transactional}: the audit entries are written on their own.
 */
@Service
public class AdminProducts {

    private final AdminProductService products;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;

    public AdminProducts(AdminProductService products, AdminAuditService audit, SiteRevalidator siteRevalidator) {
        this.products = products;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
    }

    public AdminProductDto create(ProductUpsertRequest req) {
        AdminProductDto created = products.create(req);
        audit.record("PRODUCT_CREATE", "PRODUCT", created.id(), created.title());
        return revalidated(created, null);
    }

    public AdminProductDto update(String id, ProductUpsertRequest req, boolean force) {
        // Read before the save: the journal shows what changed, the site rebuilds the old slug and
        // the categories the product is leaving.
        AdminProductDto before = products.get(id);
        AdminProductDto updated = products.update(id, req, force);
        audit.record("PRODUCT_UPDATE", "PRODUCT", id, ProductChangeSummary.changes(before, updated)
                + ProductChangeSummary.catalog(before, updated)
                + ProductChangeSummary.writeoff(before, updated, req)
                + (force && !before.active() && updated.active() ? ", выложен без оформления" : ""));
        return revalidated(updated, before);
    }

    public AdminProductDto setActive(String id, boolean active, boolean force) {
        AdminProductDto saved = products.setActive(id, active, force);
        // Journal after the fact: a 404 must not leave a "показан" entry for something that never happened.
        audit.record("PRODUCT_ACTIVE", "PRODUCT", id, active ? "показан" : "скрыт");
        return revalidated(saved, null);
    }

    public AdminProductDto setArchived(String id, boolean archived) {
        AdminProductDto saved = products.setArchived(id, archived);
        audit.record("PRODUCT_ARCHIVE", "PRODUCT", id, archived ? "в архив" : "из архива");
        return revalidated(saved, null);
    }

    /**
     * Rebuild the site pages this product appears on (no-op when revalidation is off): its page,
     * its category path (leaf and parent) and «Уценка» — and, after an edit, the path and slug it had
     * before, or a product moved out of a category kept showing there until ISR expiry.
     */
    private AdminProductDto revalidated(AdminProductDto p, AdminProductDto before) {
        Set<String> categories = new LinkedHashSet<>(pathSlugs(p));
        if (before != null) {
            categories.addAll(pathSlugs(before));
        }
        if (!"NEW".equals(p.condition()) || (before != null && !"NEW".equals(before.condition()))) {
            categories.add(MarkdownCollection.SLUG);
        }
        siteRevalidator.productChanged(p.slug(), before == null ? null : before.slug(), categories);
        return p;
    }

    /** The category path root → leaf ({@code tags} carries it). */
    private static List<String> pathSlugs(AdminProductDto p) {
        return p.tags() == null ? List.of() : p.tags().stream().map(t -> t.slug()).toList();
    }
}
