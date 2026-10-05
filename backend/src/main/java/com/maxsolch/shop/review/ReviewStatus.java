package com.maxsolch.shop.review;

/** Lifecycle of a product review (V44). */
public enum ReviewStatus {
    /** Written, waits for an admin (premoderation on). Only the author sees it, and may still edit it. */
    PENDING,
    /** Visible on the product page; counts towards the product rating. */
    PUBLISHED,
    /** Hidden by an admin; only the author (and the admin) sees it. */
    HIDDEN
}
