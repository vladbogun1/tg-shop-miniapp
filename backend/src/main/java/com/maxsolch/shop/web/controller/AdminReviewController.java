package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.review.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.ReviewDtos.AdminReview;
import com.maxsolch.shop.review.ReviewDtos.ReplyRequest;
import com.maxsolch.shop.review.ReviewService;
import com.maxsolch.shop.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** «Отзывы» in the admin: moderation queue, publish / hide / reply / delete. Every change is audited. */
@RestController
@RequestMapping("/api/admin/reviews")
@RequiredAdmin
@Tag(name = "Admin reviews", description = "Review moderation")
@SecurityRequirement(name = "bearer-jwt")
public class AdminReviewController {

    private static final String ENTITY = "REVIEW";

    private final ReviewService reviewService;
    private final AdminAuditService audit;

    public AdminReviewController(ReviewService reviewService, AdminAuditService audit) {
        this.reviewService = reviewService;
        this.audit = audit;
    }

    @GetMapping
    @Operation(summary = "Reviews, newest first; status = PENDING | PUBLISHED | HIDDEN | ALL, optional productId")
    public AdminPage list(@RequestParam(required = false) String status,
                          @RequestParam(required = false) String productId,
                          @RequestParam(defaultValue = "0") int page,
                          @RequestParam(defaultValue = "30") int size) {
        return reviewService.adminList(status, productId, page, size);
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "Publish (the first published review of an order issues the customer's bonus code)")
    public AdminReview publish(@PathVariable long id) {
        AdminReview r = reviewService.publish(id);
        audit.record("REVIEW_PUBLISH", ENTITY, String.valueOf(id), describe(r));
        return r;
    }

    @PostMapping("/{id}/hide")
    @Operation(summary = "Hide from the product page")
    public AdminReview hide(@PathVariable long id) {
        AdminReview r = reviewService.hide(id);
        audit.record("REVIEW_HIDE", ENTITY, String.valueOf(id), describe(r));
        return r;
    }

    @PostMapping("/{id}/reply")
    @Operation(summary = "Public reply of the shop; blank text removes it")
    public AdminReview reply(@PathVariable long id, @RequestBody ReplyRequest req) {
        AdminReview r = reviewService.reply(id, req == null ? null : req.text());
        audit.record(r.adminReply() == null ? "REVIEW_REPLY_REMOVE" : "REVIEW_REPLY", ENTITY,
                String.valueOf(id), describe(r));
        return r;
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a review for good")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        AdminReview r = reviewService.delete(id);
        audit.record("REVIEW_DELETE", ENTITY, String.valueOf(id), describe(r));
        return ResponseEntity.noContent().build();
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
