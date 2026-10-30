package com.maxsolch.shop.review.domain;

import java.util.List;

/**
 * Average, count and the 1★..5★ distribution of published reviews.
 *
 * @param avg          null when there are none
 * @param distribution counts of 1★..5★, index 0 = 1★
 */
public record RatingSummary(Double avg, long count, List<Long> distribution) {
}
