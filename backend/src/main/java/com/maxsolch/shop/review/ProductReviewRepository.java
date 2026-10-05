package com.maxsolch.shop.review;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductReviewRepository extends JpaRepository<ProductReview, Long> {

    Optional<ProductReview> findByOrderItemId(Long orderItemId);

    List<ProductReview> findByUserIdOrderByCreatedAtDesc(Long userId);

    /** Reviews written by the customer since {@code since} — the {@code reviews.maxPerDay} limit. */
    long countByUserIdAndCreatedAtAfter(Long userId, Instant since);

    /** Lines of these orders that already have a review (any status). */
    @Query("select r.orderItemId from ProductReview r where r.orderItemId in :itemIds")
    List<Long> reviewedItemIds(@Param("itemIds") Collection<Long> itemIds);

    Page<ProductReview> findByProductIdAndStatus(byte[] productId, ReviewStatus status, Pageable pageable);

    Page<ProductReview> findByProductId(byte[] productId, Pageable pageable);

    Page<ProductReview> findByStatus(ReviewStatus status, Pageable pageable);

    /** {@code [rating, count]} of the published reviews of a product. */
    @Query("select r.rating, count(r) from ProductReview r "
            + "where r.productId = :productId and r.status = com.maxsolch.shop.review.ReviewStatus.PUBLISHED "
            + "group by r.rating")
    List<Object[]> distribution(@Param("productId") byte[] productId);

    long countByStatus(ReviewStatus status);
}
