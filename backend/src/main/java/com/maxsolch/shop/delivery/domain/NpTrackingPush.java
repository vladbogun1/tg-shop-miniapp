package com.maxsolch.shop.delivery.domain;

import java.util.List;

/**
 * Subscriptions to tracking pushes of the new Nova Poshta REST API ({@code /tracking-push/subscribers}, JWT from
 * the API key). Writes are refused under {@code NP_DRY_RUN}. Failures are {@link NovaPoshtaException}.
 */
public interface NpTrackingPush {

    /** One subscription as NP lists it. */
    record Subscription(String id, String type, String url, boolean active, List<String> companyTins) {
    }

    List<Subscription> list();

    /** A «legal» subscription for the company (EDRPOU / ІПН), all status events to {@code url}. */
    Subscription createLegal(String url, String secret, List<String> companyTins);

    void delete(String id);
}
