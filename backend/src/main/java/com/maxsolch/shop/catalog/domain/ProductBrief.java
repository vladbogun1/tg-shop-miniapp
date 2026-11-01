package com.maxsolch.shop.catalog.domain;

/** What another module's screens show about a product: current title, slug, first image, and whether it has a page. */
public record ProductBrief(String title, String slug, String imageUrl, boolean live) {
}
