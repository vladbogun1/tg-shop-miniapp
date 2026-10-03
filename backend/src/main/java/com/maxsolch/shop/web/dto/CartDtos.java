package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;

/** Server-side cart (docs/SITE-SPEC.md, «Серверная корзина»). */
public final class CartDtos {

    private CartDtos() {
    }

    /** One line as a client sends it. {@code variantId} null/blank = product without variants. */
    public record CartLineInput(String productId, String variantId, int quantity) {
    }

    /** Body of {@code PUT /api/me/cart} and {@code POST /api/me/cart/merge}. */
    public record CartWriteRequest(@NotNull List<CartLineInput> lines) {
    }

    /**
     * A stored line with TODAY's product data (title/variant in the request language, current price
     * and stock). {@code available=false} lines cannot be ordered; {@code problem} says why:
     * {@code INACTIVE} (hidden/archived by the shop), {@code OUT_OF_STOCK}, {@code VARIANT_REQUIRED}
     * (the product got variants after the line was added).
     */
    public record CartLineDto(
            String productId,
            String variantId,
            int quantity,
            String title,
            String slug,
            String variantName,
            String imageUrl,
            long priceMinor,
            Long compareAtMinor,
            String currency,
            int stock,
            boolean available,
            String problem,
            Instant addedAt) {
    }

    /**
     * The whole cart. {@code version} grows with every change (any device, and the removal of
     * ordered lines at checkout); clients compare it to decide whether to re-read. 0 = never written.
     */
    public record CartDto(long version, Instant updatedAt, List<CartLineDto> lines, int maxLines, int maxQuantity) {
    }
}
