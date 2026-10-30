package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CardAcceptRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.springframework.stereotype.Service;

/**
 * What the admin does in «Карточки»: applies an AI answer, accepts a card after review, sets a card status. Runs the
 * import/product service, journals the action and rebuilds the site when the texts changed. Not {@code @Transactional}:
 * audit entries are written on their own.
 */
@Service
public class AdminCards {

    private final CardsImporter importer;
    private final AdminProductService products;
    private final AdminAuditService audit;
    private final SiteRevalidator siteRevalidator;
    private final CurrentActor actor;

    public AdminCards(CardsImporter importer, AdminProductService products, AdminAuditService audit,
                      SiteRevalidator siteRevalidator, CurrentActor actor) {
        this.importer = importer;
        this.products = products;
        this.audit = audit;
        this.siteRevalidator = siteRevalidator;
        this.actor = actor;
    }

    public CardsImportResult importCards(CardsImportRequest body) {
        CardsImportResult r = importer.importCards(body, actorId());
        long published = r.items().stream().filter(i -> i.published()).count();
        audit.record("CARDS_IMPORT", "PRODUCT", null, "применено " + r.applied() + ", отклонено "
                + r.rejected().size() + ", замечаний " + r.issues().size()
                + (r.createdBrands().isEmpty() ? "" : ", новые бренды: " + String.join(", ", r.createdBrands()))
                + ", на витрине " + published);
        siteRevalidator.allChanged();
        return r;
    }

    public CardsImportResult accept(String productId, CardAcceptRequest body) {
        CardsImportResult r = importer.accept(productId, body, actorId());
        boolean edited = body != null && (body.title() != null || body.description() != null
                || body.specs() != null || body.translations() != null);
        audit.record("CARD_ACCEPT", "PRODUCT", productId, (edited ? "принято с правками" : "принято")
                + (r.issues().isEmpty() ? "" : ", замечаний " + r.issues().size()));
        if (edited) {
            siteRevalidator.allChanged();
        }
        return r;
    }

    public AdminProductDto setCardStatus(String id, String status) {
        AdminProductDto p = products.setCardStatus(id, status, actorId());
        audit.record("PRODUCT_CARD_STATUS", "PRODUCT", id, p.title() + ": " + p.cardStatus());
        return p;
    }

    private Long actorId() {
        return actor.isPresent() ? actor.userId() : null;
    }
}
