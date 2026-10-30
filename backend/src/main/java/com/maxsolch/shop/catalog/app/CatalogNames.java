package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.ProductVariantRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.app.TranslationService.Overlay;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

/** Translated product and variant names for other modules (the lines of a customer's order). */
@Service
public class CatalogNames {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final TranslationService translationService;

    public CatalogNames(ProductRepository productRepository, ProductVariantRepository variantRepository,
                        TranslationService translationService) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.translationService = translationService;
    }

    /** The Russian catalog title of a product for an error message; the id itself when there is no such product. */
    @Transactional(readOnly = true)
    public String titleOrId(String productId) {
        try {
            List<Object[]> rows = productRepository.titlesByIds(List.of(com.maxsolch.shop.platform.util.UuidUtil.toBytes(productId)));
            return rows.isEmpty() ? productId : (String) rows.get(0)[1];
        } catch (IllegalArgumentException e) {
            return productId;
        }
    }

    /**
     * Translated names for the lines of a customer's order: product id to title, variant id to name,
     * only where the product/variant still exists and its translation is current. Callers fall back
     * to the Russian snapshot ({@code order_items.title_snapshot} stays Russian for the seller).
     */
    @Transactional(readOnly = true)
    public ItemNames orderItemNames(Collection<byte[]> productIds, Collection<byte[]> variantIds, String lang) {
        Overlay overlay = translationService.overlay(lang);
        if (!overlay.active()) {
            return ItemNames.EMPTY;
        }
        Map<String, String> titles = new HashMap<>();
        if (!productIds.isEmpty()) {
            for (Object[] row : productRepository.titlesByIds(TranslationService.distinct(productIds))) {
                String id = UuidUtil.toString((byte[]) row[0]);
                String source = (String) row[1];
                String text = overlay.text(TranslationEntityType.PRODUCT, id, TranslationEntityType.TITLE, source);
                if (text != null && !text.equals(source)) {
                    titles.put(id, text);
                }
            }
        }
        Map<String, String> variants = new HashMap<>();
        if (!variantIds.isEmpty()) {
            for (Object[] row : variantRepository.namesByIds(TranslationService.distinct(variantIds))) {
                String id = UuidUtil.toString((byte[]) row[0]);
                String source = (String) row[1];
                String text = overlay.text(TranslationEntityType.VARIANT, id, TranslationEntityType.NAME, source);
                if (text != null && !text.equals(source)) {
                    variants.put(id, text);
                }
            }
        }
        return new ItemNames(titles, variants);
    }

    /** Translated order-line names; absent key = show the snapshot. */
    public record ItemNames(Map<String, String> productTitles, Map<String, String> variantNames) {
        public static final ItemNames EMPTY = new ItemNames(Map.of(), Map.of());

        public String title(String productId, String snapshot) {
            return productId == null ? snapshot : productTitles.getOrDefault(productId, snapshot);
        }

        public String variant(String variantId, String snapshot) {
            return variantId == null ? snapshot : variantNames.getOrDefault(variantId, snapshot);
        }
    }
}
