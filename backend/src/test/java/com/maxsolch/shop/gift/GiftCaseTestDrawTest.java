package com.maxsolch.shop.gift;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.web.dto.ProductDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** «Тест кейса»: the checkout's draw with nothing saved (docs/GIFT-CASE.md). */
class GiftCaseTestDrawTest {

    private static final String IN_STOCK = UUID.randomUUID().toString();
    private static final String SOLD_OUT = UUID.randomUUID().toString();

    private GiftCaseItemRepository items;
    private GiftCaseTierRepository tiers;
    private OrderGiftCaseRepository orderCases;
    private PromoCodeRepository promoCodes;
    private SettingsService settings;
    private GiftService service;

    @BeforeEach
    void setUp() {
        items = mock(GiftCaseItemRepository.class);
        tiers = mock(GiftCaseTierRepository.class);
        orderCases = mock(OrderGiftCaseRepository.class);
        promoCodes = mock(PromoCodeRepository.class);
        settings = mock(SettingsService.class);
        CatalogService catalog = mock(CatalogService.class);
        service = new GiftService(settings, catalog, items, tiers, orderCases, promoCodes);

        GiftCaseTier silver = new GiftCaseTier();
        silver.setTier(GiftCaseTier.Tier.SILVER);
        silver.setEnabled(false); // a disabled tier can be tested too
        silver.setThresholdUah(3000);
        when(tiers.findAll()).thenReturn(List.of(silver));
        when(items.findAllByOrderBySortOrderAscIdAsc()).thenReturn(List.of(
                product(1, IN_STOCK, GiftCaseItem.Rarity.COMMON, 60 * GiftService.CASE_WEIGHT_PER_PERCENT),
                discount(2, 10, GiftCaseItem.Rarity.RARE, 30 * GiftService.CASE_WEIGHT_PER_PERCENT),
                discount(3, 50, GiftCaseItem.Rarity.GOLD, 10 * GiftService.CASE_WEIGHT_PER_PERCENT),
                product(4, SOLD_OUT, GiftCaseItem.Rarity.EPIC, 50 * GiftService.CASE_WEIGHT_PER_PERCENT),
                discount(5, 20, GiftCaseItem.Rarity.EPIC, 0)));
        List<ProductDto> catalogProducts = List.of(stock(IN_STOCK, 3), stock(SOLD_OUT, 0));
        when(catalog.listActiveProducts(anyString())).thenReturn(catalogProducts);
    }

    @Test
    void drawsByWeightsAmongPrizesThatCanDrop() {
        int n = GiftService.TEST_MAX_COUNT;
        GiftDtos.TestDrawDto res = service.testDraw("silver", n, new SplittableRandom(11));

        assertThat(res.tier()).isEqualTo("SILVER");
        assertThat(res.count()).isEqualTo(n);
        Map<Long, GiftDtos.TestHitDto> hits = res.hits().stream()
                .collect(Collectors.toMap(GiftDtos.TestHitDto::id, h -> h));
        // Sold out (4) and weight 0 (5) are not in the pool, like at checkout.
        assertThat(hits.keySet()).containsExactlyInAnyOrder(1L, 2L, 3L);
        assertThat(res.hits().stream().mapToInt(GiftDtos.TestHitDto::hits).sum()).isEqualTo(n);
        assertThat(hits.get(1L).chancePercent()).isEqualTo(60.0);
        assertThat(hits.get(2L).chancePercent()).isEqualTo(30.0);
        assertThat(hits.get(3L).chancePercent()).isEqualTo(10.0);
        assertThat(hits.get(1L).hits() / (double) n).isCloseTo(0.60, within(0.02));
        assertThat(hits.get(2L).hits() / (double) n).isCloseTo(0.30, within(0.02));
        assertThat(hits.get(3L).hits() / (double) n).isCloseTo(0.10, within(0.015));
        assertThat(hits.get(1L).key()).isEqualTo("p" + IN_STOCK);
        assertThat(hits.get(2L).key()).isEqualTo("d2");

        assertThat(res.drops()).hasSize(GiftService.TEST_DROPS_SHOWN);
        assertThat(res.won()).isEqualTo(res.drops().get(0));
        assertThat(res.reel()).extracting(GiftDtos.CaseItemDto::key).containsExactlyInAnyOrder("p" + IN_STOCK, "d2", "d3");
    }

    @Test
    void singleDrawGivesTheWinAndTheReel() {
        GiftDtos.TestDrawDto res = service.testDraw("SILVER", 1, new SplittableRandom(3));
        assertThat(res.drops()).hasSize(1);
        assertThat(res.reel()).extracting(GiftDtos.CaseItemDto::key).contains(res.won().key());
        assertThat(res.hits().stream().mapToInt(GiftDtos.TestHitDto::hits).sum()).isEqualTo(1);
    }

    @Test
    void savesNothing() {
        service.testDraw("SILVER", 500, new SplittableRandom(5));
        // No order prize, no promo code, no settings change; the catalog / prize lists are only read.
        verifyNoInteractions(orderCases, promoCodes, settings);
        verify(items, never()).save(any());
        verify(tiers, never()).save(any());
    }

    @Test
    void testsTheUnpublishedDraft() {
        GiftCaseTier silver = tiers.findAll().get(0);
        when(tiers.findById(GiftCaseTier.Tier.SILVER)).thenReturn(java.util.Optional.of(silver));
        int w = GiftService.CASE_WEIGHT_PER_PERCENT;
        List<GiftDtos.CaseDraftItem> draft = List.of(
                new GiftDtos.CaseDraftItem(1L, "PRODUCT", IN_STOCK, null, null, "COMMON", 50 * w, true),
                new GiftDtos.CaseDraftItem(null, "DISCOUNT", null, null, 200, "RARE", 50 * w, true),
                new GiftDtos.CaseDraftItem(null, "PRODUCT", SOLD_OUT, null, null, "EPIC", 10 * w, true),
                new GiftDtos.CaseDraftItem(null, "DISCOUNT", null, 10, null, "RARE", 10 * w, false));
        GiftDtos.TestDrawDto res = service.testDraw("SILVER", 2000, draft, new SplittableRandom(7));
        Map<Long, GiftDtos.TestHitDto> hits = res.hits().stream()
                .collect(Collectors.toMap(GiftDtos.TestHitDto::id, h -> h));
        // The saved prizes are ignored; new draft prizes get -(index + 1); sold out and switched off drop out.
        assertThat(hits.keySet()).containsExactlyInAnyOrder(1L, -2L);
        assertThat(hits.get(-2L).chancePercent()).isEqualTo(50.0);
        verify(items, never()).save(any());
    }

    @Test
    void refusesBadInput() {
        assertThatThrownBy(() -> service.testDraw("PLATINUM", 1, new SplittableRandom(1)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.testDraw("SILVER", 0, new SplittableRandom(1)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.testDraw("SILVER", GiftService.TEST_MAX_COUNT + 1, new SplittableRandom(1)))
                .isInstanceOf(BadRequestException.class);
        // A tier without prizes that can drop.
        assertThatThrownBy(() -> service.testDraw("GOLD", 1, new SplittableRandom(1)))
                .isInstanceOf(BadRequestException.class);
    }

    private static GiftCaseItem product(long id, String productId, GiftCaseItem.Rarity rarity, int weight) {
        GiftCaseItem i = item(id, rarity, weight);
        i.setKind(GiftCaseItem.Kind.PRODUCT);
        i.setProductId(UuidUtil.toBytes(productId));
        return i;
    }

    private static GiftCaseItem discount(long id, int percent, GiftCaseItem.Rarity rarity, int weight) {
        GiftCaseItem i = item(id, rarity, weight);
        i.setKind(GiftCaseItem.Kind.DISCOUNT);
        i.setDiscountPercent(percent);
        return i;
    }

    private static GiftCaseItem item(long id, GiftCaseItem.Rarity rarity, int weight) {
        GiftCaseItem i = new GiftCaseItem();
        i.setId(id);
        i.setTier(GiftCaseTier.Tier.SILVER);
        i.setRarity(rarity);
        i.setWeight(weight);
        i.setActive(true);
        return i;
    }

    private static ProductDto stock(String id, int stock) {
        ProductDto p = mock(ProductDto.class);
        when(p.id()).thenReturn(id);
        when(p.effectiveStock()).thenReturn(stock);
        when(p.title()).thenReturn("Товар " + id.substring(0, 4));
        when(p.priceMinor()).thenReturn(49_900L);
        return p;
    }
}
