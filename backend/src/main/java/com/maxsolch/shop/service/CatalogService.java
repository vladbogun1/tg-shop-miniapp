package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
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
 * descriptions, variant and tag names (docs/CONTENT-I18N.md). The key is normalised in SpEL so an
 * unexpected value can never grow the cache beyond the three languages.
 */
@Service
public class CatalogService {

    private static final String LANG_KEY = "T(com.maxsolch.shop.translation.ContentLocale).normalize(#lang)";

    private final ProductRepository productRepository;
    private final TagRepository tagRepository;
    private final OrderItemRepository orderItemRepository;
    private final TranslationService translationService;

    public CatalogService(ProductRepository productRepository,
                          TagRepository tagRepository,
                          OrderItemRepository orderItemRepository,
                          TranslationService translationService) {
        this.productRepository = productRepository;
        this.tagRepository = tagRepository;
        this.orderItemRepository = orderItemRepository;
        this.translationService = translationService;
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "products", key = LANG_KEY)
    public List<ProductDto> listActiveProducts(String lang) {
        Map<String, Long> sold = soldCounts();
        List<ProductDto> original = productRepository.findAllActive().stream()
                .map(p -> toDto(p, sold))
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
                .map(p -> toDto(p, soldCounts()))
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

    @Transactional(readOnly = true)
    @Cacheable(value = "tags", key = LANG_KEY)
    public List<TagDto> listTags(String lang) {
        List<TagDto> original = tagRepository.findAllByOrderByNameAsc().stream()
                .map(TagDto::of)
                .toList();
        return translationService.overlay(lang).tags(original);
    }

    private ProductDto toDto(Product p, Map<String, Long> soldCounts) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(), v.getStock(), v.getSortOrder()))
                .toList();
        List<TagDto> tags = p.getTags().stream()
                .map(this::toTagDto)
                .toList();
        String id = UuidUtil.toString(p.getId());
        return new ProductDto(
                id,
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.isActive(),
                soldCounts.getOrDefault(id, 0L),
                images,
                variants,
                tags,
                p.getSlug(),
                p.getCompareAtMinor(),
                p.getSeoTitle(),
                p.getSeoDescription(),
                p.getCreatedAt());
    }

    private TagDto toTagDto(Tag t) {
        return TagDto.of(t);
    }
}
