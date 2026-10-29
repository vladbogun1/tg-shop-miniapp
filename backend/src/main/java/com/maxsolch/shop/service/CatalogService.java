package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.catalog.ProductCatalogFields;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.ProductImageDto;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Catalog for the Mini App and (through {@link PublicCatalogService}) the website.
 *
 * <p>Every method takes the content language ({@code ru}/{@code uk}/{@code en}, see
 * {@link ContentLocale}) and the caches are keyed by it: the DTOs carry translated titles,
 * descriptions, variant and category names (docs/CONTENT-I18N.md). The key is normalised in SpEL so an
 * unexpected value can never grow the cache beyond the three languages.
 */
@Service
public class CatalogService {

    private static final String LANG_KEY = "T(com.maxsolch.shop.translation.ContentLocale).normalize(#lang)";

    private final ProductRepository productRepository;
    private final CatalogDirectory catalogDirectory;
    private final OrderItemRepository orderItemRepository;
    private final TranslationService translationService;
    /** Pre-order holds: units kept for people in a queue are not shown as in stock. */
    private final com.maxsolch.shop.preorder.PreorderQueueService preorders;

    public CatalogService(ProductRepository productRepository,
                          CatalogDirectory catalogDirectory,
                          OrderItemRepository orderItemRepository,
                          TranslationService translationService,
                          com.maxsolch.shop.preorder.PreorderQueueService preorders) {
        this.productRepository = productRepository;
        this.catalogDirectory = catalogDirectory;
        this.orderItemRepository = orderItemRepository;
        this.translationService = translationService;
        this.preorders = preorders;
    }

    private Map<String, Integer> held() {
        return preorders.heldByLine();
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "products", key = LANG_KEY)
    public List<ProductDto> listActiveProducts(String lang) {
        Map<String, Long> sold = soldCounts();
        Map<String, Integer> held = held();
        List<ProductDto> original = productRepository.findAllActive().stream()
                .map(p -> toDto(p, sold, held))
                .toList();
        return translationService.overlay(lang).products(original);
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "productById", key = LANG_KEY + " + ':' + #id")
    public Optional<ProductDto> getProduct(String id, String lang) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return productRepository.findByIdWithDetails(key)
                .filter(p -> p.isActive() && !p.isArchived())
                .map(p -> toDto(p, soldCounts(), held()))
                .map(translationService.overlay(lang)::product);
    }

    /**
     * Units sold per product, keyed by product id.
     *
     * <p>{@code soldCount} shipped as a hardcoded {@code 0}, which quietly broke the catalog's
     * default "популярные сначала" sort and the admin's "Продажи ↓" — both silently degraded to
     * alphabetical. One grouped query, and it rides the same catalog cache as the products.
     */
    private Map<String, Long> soldCounts() {
        Map<String, Long> sold = new HashMap<>();
        for (Object[] row : orderItemRepository.soldCountsByProduct()) {
            if (row[0] != null) {
                sold.put(UuidUtil.toString((byte[]) row[0]), ((Number) row[1]).longValue());
            }
        }
        return sold;
    }

    /** The stock a customer sees: minus the units held for people in a pre-order queue. */
    private static int shownStock(Product p, Map<String, Integer> held) {
        if (held.isEmpty()) {
            return p.getStock();
        }
        int heldHere = 0;
        if (p.getVariants() == null || p.getVariants().isEmpty()) {
            heldHere = held.getOrDefault(com.maxsolch.shop.preorder.PreorderQueueService.lineKey(p.getId(), null), 0);
        } else {
            for (var v : p.getVariants()) {
                heldHere += held.getOrDefault(com.maxsolch.shop.preorder.PreorderQueueService.lineKey(p.getId(), v.getId()), 0);
            }
        }
        return Math.max(0, p.getStock() - heldHere);
    }

    private ProductDto toDto(Product p, Map<String, Long> soldCounts, Map<String, Integer> held) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(),
                        Math.max(0, v.getStock() - held.getOrDefault(
                                com.maxsolch.shop.preorder.PreorderQueueService.lineKey(p.getId(), v.getId()), 0)),
                        v.getSortOrder()))
                .toList();
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        String categoryId = ProductCatalogFields.categoryId(p);
        List<TagDto> tags = ProductCatalogFields.tags(catalog, categoryId);
        BrandRefDto brandRef = ProductCatalogFields.brandRef(catalog, ProductCatalogFields.brandId(p));
        String id = UuidUtil.toString(p.getId());
        return new ProductDto(
                id,
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                shownStock(p, held),
                p.isActive(),
                soldCounts.getOrDefault(id, 0L),
                images,
                variants,
                tags,
                p.getSlug(),
                p.getCompareAtMinor(),
                p.getSeoTitle(),
                p.getSeoDescription(),
                p.getCreatedAt(),
                brandRef == null ? null : brandRef.name(),
                p.getSku(),
                p.getRatingAvg() == null ? null : p.getRatingAvg().doubleValue(),
                p.getRatingCount(),
                categoryId,
                brandRef,
                ProductCatalogFields.condition(p),
                p.getConditionNote(),
                ProductCatalogFields.specs(p));
    }
}
