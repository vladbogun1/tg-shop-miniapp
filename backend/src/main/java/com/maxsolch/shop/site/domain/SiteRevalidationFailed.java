package com.maxsolch.shop.site.domain;

/**
 * Published when revalidation starts failing (the first failure after a success, or ever) -
 * not on every retry of an ongoing outage. Consumed by the admin push notifications.
 */
public record SiteRevalidationFailed(String error) {
}
