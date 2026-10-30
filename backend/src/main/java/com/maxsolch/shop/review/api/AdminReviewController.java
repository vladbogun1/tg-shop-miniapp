package com.maxsolch.shop.review.api;

import com.maxsolch.shop.review.app.AdminReviews;
import com.maxsolch.shop.review.app.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.app.ReviewDtos.AdminReview;
import com.maxsolch.shop.review.app.ReviewDtos.ReplyRequest;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
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

    private final AdminReviews reviews;

    public AdminReviewController(AdminReviews reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    @Operation(summary = "Reviews, newest first; status = PENDING | PUBLISHED | HIDDEN | ALL, optional productId")
    public AdminPage list(@RequestParam(required = false) String status,
                          @RequestParam(required = false) String productId,
                          @RequestParam(defaultValue = "0") int page,
                          @RequestParam(defaultValue = "30") int size) {
        return reviews.list(status, productId, page, size);
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "Publish (the first published review of an order issues the customer's bonus code)")
    public AdminReview publish(@PathVariable long id) {
        return reviews.publish(id);
    }

    @PostMapping("/{id}/hide")
    @Operation(summary = "Hide from the product page")
    public AdminReview hide(@PathVariable long id) {
        return reviews.hide(id);
    }

    @PostMapping("/{id}/reply")
    @Operation(summary = "Public reply of the shop; blank text removes it")
    public AdminReview reply(@PathVariable long id, @RequestBody ReplyRequest req) {
        return reviews.reply(id, req == null ? null : req.text());
    }

    @DeleteMapping("/{id}")
    @RequiredSuperAdmin
    @Operation(summary = "Delete a review for good (main admin only)")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        reviews.delete(id);
        return ResponseEntity.noContent().build();
    }
}
