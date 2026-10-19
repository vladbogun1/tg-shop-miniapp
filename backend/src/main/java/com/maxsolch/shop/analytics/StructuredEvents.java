package com.maxsolch.shop.analytics;

import java.util.Set;

/**
 * Names of the structured events the Mini App and the website send (contract shared with the
 * clients: {@code frontend/lib/analytics.ts}, {@code site/lib/analytics.ts}). Their {@code meta}
 * is a JSON object; {@code productId} in it is lifted into {@code client_events.product_id}.
 *
 * <ul>
 *   <li>{@code product_view {productId}} — a product card/page was opened</li>
 *   <li>{@code add_to_cart {productId, variantId, qty}} — a line was added to the cart</li>
 *   <li>{@code checkout_start} — the checkout screen was opened with a non-empty cart</li>
 *   <li>{@code order_created {orderId}} — the order went through</li>
 *   <li>{@code compare_add {productId}} / {@code compare_open {count}} — the comparison (docs/COMPARE.md)</li>
 * </ul>
 * The older free-text events ({@code click}/{@code view}/{@code error}) stay valid; the aggregator
 * recognises them for the history recorded before these existed.
 */
public final class StructuredEvents {

    public static final String PRODUCT_VIEW = "product_view";
    public static final String ADD_TO_CART = "add_to_cart";
    public static final String CHECKOUT_START = "checkout_start";
    public static final String ORDER_CREATED = "order_created";
    public static final String COMPARE_ADD = "compare_add";
    public static final String COMPARE_OPEN = "compare_open";
    /** Gift case: the opening screen played (meta: orderId, rarity). */
    public static final String GIFT_CASE_OPEN = "gift_case_open";
    /** «Вместе дешевле»: the block was shown (meta: place, productIds) / an accessory or the set was added. */
    public static final String BUNDLE_VIEW = "bundle_view";
    public static final String BUNDLE_ADD = "bundle_add";
    /** 2.0: the visitor is in the control group — the block would have shown but was hidden (meta: place, ids). */
    public static final String BUNDLE_HOLDOUT = "bundle_holdout";

    /**
     * What an anonymous website visitor may write. Clicks carry only a label of what was tapped and,
     * in {@code meta}, a description of the element actually hit — never field values.
     */
    public static final Set<String> WEB_ALLOWED = Set.of(
            "view", "click", "error", PRODUCT_VIEW, ADD_TO_CART, CHECKOUT_START, ORDER_CREATED, COMPARE_ADD, COMPARE_OPEN,
            GIFT_CASE_OPEN, BUNDLE_VIEW, BUNDLE_ADD, BUNDLE_HOLDOUT);

    private StructuredEvents() {
    }
}
