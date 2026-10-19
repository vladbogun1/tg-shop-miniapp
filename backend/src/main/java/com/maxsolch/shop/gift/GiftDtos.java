package com.maxsolch.shop.gift;

import com.maxsolch.shop.web.dto.ProductDto;

import java.time.Instant;
import java.util.List;

/** API of the gift for the order sum and the gift case (docs/GIFT-CASE.md). */
public final class GiftDtos {

    private GiftDtos() {
    }

    /**
     * The gift for the order sum as the storefront shows it (GET /api/public/gift). The clients count
     * «add N more» themselves: {@code thresholdMinor} − the cart total after the discount (or − the
     * product price on the product page); the checkout decides it again on the server.
     *
     * @param kind      PRODUCT (one known gift) | CASE (a random prize from {@code caseItems})
     * @param product   the gift (kind PRODUCT); null for a case
     * @param caseItems prizes of the case in stock with their chances, most common first (kind CASE)
     */
    public record GiftInfoDto(long thresholdMinor, String kind, ProductDto product, List<CaseItemDto> caseItems) {
    }

    /** GET /api/public/gift; {@code gift} null = the gift is off or has nothing in stock. */
    public record GiftResponse(GiftInfoDto gift) {
    }

    /** A prize of the gift case as the customer sees it; {@code chancePercent} among the prizes in stock. */
    public record CaseItemDto(String productId, String title, String imageUrl, long priceMinor,
                              String rarity, double chancePercent) {
    }

    /** Opening the case of an order: the prize (drawn at checkout) and the prizes for the reel. */
    public record CaseOpenDto(String status, CaseItemDto won, List<CaseItemDto> reel) {
    }

    // ---- admin ----

    public record CaseItemAdminDto(long id, String productId, String title, String imageUrl, long priceMinor,
                                   int stock, boolean productActive, String rarity, int weight,
                                   double chancePercent, int sortOrder, boolean active) {
    }

    public record CaseItemRequest(String productId, String rarity, Integer weight, Integer sortOrder, Boolean active) {
    }

    /** Orders since {@code since} (30 days): with an automatic gift, with a case / of them opened. */
    public record GiftStatsDto(Instant since, long orders, long giftOrders, long caseOrders, long casesOpened) {
    }
}
