package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.ProductPhotoImport;
import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.notification.app.AdminPushService.PushMessage;
import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.procurement.domain.SupplyDraftEvents;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;

/**
 * What follows a supply draft's commit: the push «Поставка готова — проверьте» to the admin who started it (a tap
 * opens the draft), and the pictures of the new products, fetched by the links the AI found (each up to ~40 s, with
 * the background cut out) on one background thread — a picture that does not come is simply left out; the admin
 * adds it on the product.
 */
@Slf4j
@Component
class SupplyDraftAfterCommit {

    /** Pictures taken per new product: the first ones the card found. */
    static final int PHOTOS_PER_PRODUCT = 3;

    private final AdminPushService push;
    private final ProductPhotoImport photos;
    private final ExecutorService worker;

    SupplyDraftAfterCommit(AdminPushService push, ProductPhotoImport photos, Workers workers) {
        this.push = push;
        this.photos = photos;
        this.worker = workers.single("supply-draft-photos");
    }

    @OnCommitted
    void onReady(SupplyDraftEvents.Ready e) {
        try {
            String body = (e.title() == null || e.title().isBlank() ? "Накладная" : e.title()) + ": строк " + e.lines()
                    + (e.newProducts() > 0 ? ", новых товаров " + e.newProducts() : "");
            push.notifyAdmins(new PushMessage("Поставка готова — проверьте", body, "/preorders/drafts/" + e.draftId(),
                    "supply-draft-" + e.draftId(), null, false), id -> id == e.adminId());
        } catch (RuntimeException ex) {
            log.warn("supply draft {}: push failed: {}", e.draftId(), ex.toString());
        }
    }

    @OnCommitted
    void onAccepted(SupplyDraftEvents.Accepted e) {
        if (e.photos().isEmpty()) {
            return;
        }
        worker.execute(() -> fetch(e.draftId(), e.photos()));
    }

    private void fetch(long draftId, Map<String, List<String>> links) {
        links.forEach((productId, urls) -> urls.stream().limit(PHOTOS_PER_PRODUCT).forEach(url -> {
            try {
                photos.importPhoto(productId, url);
            } catch (RuntimeException ex) {
                log.info("supply draft {}: photo {} for {} skipped: {}", draftId, url, productId, ex.toString());
            }
        }));
    }
}
