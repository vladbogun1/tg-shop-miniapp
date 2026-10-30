package com.maxsolch.shop.review.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.review.app.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.app.ReviewDtos.AdminReview;
import org.springframework.stereotype.Service;

/**
 * What the admin does on «Отзывы», one method per button: runs the change in {@link ReviewModeration} and journals
 * it. Deleting is for the main admin only — the controller method carries that annotation.
 */
@Service
public class AdminReviews {

    private static final String ENTITY = "REVIEW";

    private final ReviewModeration moderation;
    private final AdminAuditService audit;

    public AdminReviews(ReviewModeration moderation, AdminAuditService audit) {
        this.moderation = moderation;
        this.audit = audit;
    }

    public AdminPage list(String status, String productId, int page, int size) {
        return moderation.adminList(status, productId, page, size);
    }

    public AdminReview publish(long id) {
        AdminReview r = moderation.publish(id);
        audit.record("REVIEW_PUBLISH", ENTITY, String.valueOf(id), describe(r));
        return r;
    }

    public AdminReview hide(long id) {
        AdminReview r = moderation.hide(id);
        audit.record("REVIEW_HIDE", ENTITY, String.valueOf(id), describe(r));
        return r;
    }

    public AdminReview reply(long id, String text) {
        AdminReview r = moderation.reply(id, text);
        audit.record(r.adminReply() == null ? "REVIEW_REPLY_REMOVE" : "REVIEW_REPLY", ENTITY,
                String.valueOf(id), describe(r));
        return r;
    }

    public void delete(long id) {
        AdminReview r = moderation.delete(id);
        audit.record("REVIEW_DELETE", ENTITY, String.valueOf(id), describe(r));
    }

    private static String describe(AdminReview r) {
        String text = r.text() == null ? "" : r.text().replaceAll("\\s+", " ").trim();
        if (text.length() > 80) {
            text = text.substring(0, 79) + "…";
        }
        return r.rating() + "★ " + (r.productTitle() == null ? "" : r.productTitle())
                + (r.orderShortId() == null ? "" : ", заказ #" + r.orderShortId())
                + (text.isEmpty() ? "" : ": " + text);
    }
}
