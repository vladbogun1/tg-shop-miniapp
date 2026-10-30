package com.maxsolch.shop.gift.app;

import com.maxsolch.shop.catalog.app.ProductDto;
import com.maxsolch.shop.gift.app.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.domain.GiftCaseItem;
import com.maxsolch.shop.gift.domain.GiftError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import java.util.Locale;
import java.util.Map;

/**
 * How the admin's case prize rows are read and shown: the kind, rarity, chance weight and discount of a
 * request, whether a prize can drop now, its admin card. Pure functions for {@link AdminGiftService}.
 */
final class CasePrizeRules {

    private CasePrizeRules() {
    }

    static boolean live(GiftCaseItem i, Map<String, ProductDto> byId) {
        if (!i.isActive() || i.getWeight() <= 0) {
            return false;
        }
        if (i.isDiscount()) {
            return i.getDiscountPercent() > 0 || i.getDiscountUah() > 0;
        }
        return i.getProductId() != null && GiftService.inStock(byId.get(UuidUtil.toString(i.getProductId())));
    }

    static CaseItemAdminDto caseDto(GiftCaseItem i, ProductDto p, long total, boolean live) {
        double chance = live ? GiftCaseDraw.chancePercent(i.getWeight(), total) : 0;
        boolean discount = i.isDiscount();
        String title = discount ? discountLabel(i) : p == null ? "(товар скрыт или удалён)" : p.title();
        return new CaseItemAdminDto(i.getId(), i.getTier().name(), i.getKind().name(),
                i.getProductId() == null ? null : UuidUtil.toString(i.getProductId()), title,
                discount ? null : GiftService.image(p), discount || p == null ? 0 : p.priceMinor(),
                discount || p == null ? 0 : p.effectiveStock(), discount || p != null, i.getDiscountPercent(),
                i.getDiscountUah(), i.getRarity().name(), i.getWeight(), chance, i.getSortOrder(), i.isActive());
    }

    static String discountLabel(GiftCaseItem i) {
        return i.getDiscountPercent() > 0 ? "Скидка " + i.getDiscountPercent() + " %" : "Скидка " + i.getDiscountUah() + " ₴";
    }

    static void setDiscount(GiftCaseItem item, Integer percent, Integer uah) {
        int pc = percent == null ? 0 : percent;
        int amount = uah == null ? 0 : uah;
        if (pc < 0 || pc > 50) {
            throw new DomainException.BadRequest(GiftError.PERCENT_OUT_OF_RANGE);
        }
        if (amount < 0 || amount > 100_000) {
            throw new DomainException.BadRequest(GiftError.AMOUNT_OUT_OF_RANGE);
        }
        if (pc == 0 && amount == 0) {
            throw new DomainException.BadRequest(GiftError.DISCOUNT_REQUIRED);
        }
        item.setDiscountPercent(pc);
        item.setDiscountUah(pc > 0 ? 0 : amount);
    }

    static GiftCaseItem.Kind kind(String value) {
        if (value == null || value.isBlank()) {
            return GiftCaseItem.Kind.PRODUCT;
        }
        try {
            return GiftCaseItem.Kind.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(GiftError.UNKNOWN_PRIZE_KIND, value);
        }
    }

    static GiftCaseItem.Rarity rarity(String value, GiftCaseItem.Rarity def) {
        if (value == null || value.isBlank()) {
            return def;
        }
        try {
            return GiftCaseItem.Rarity.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(GiftError.UNKNOWN_RARITY, value);
        }
    }

    static int weight(Integer value, int def) {
        if (value == null) {
            return def;
        }
        if (value < 0 || value > 100 * GiftService.CASE_WEIGHT_PER_PERCENT) {
            throw new DomainException.BadRequest(GiftError.CHANCE_OUT_OF_RANGE);
        }
        return value;
    }
}
