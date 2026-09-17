package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
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

@Service
public class CatalogService {

    private final ProductRepository productRepository;
    private final TagRepository tagRepository;
    private final OrderItemRepository orderItemRepository;

    public CatalogService(ProductRepository productRepository,
                          TagRepository tagRepository,
                          OrderItemRepository orderItemRepository) {
        this.productRepository = productRepository;
        this.tagRepository = tagRepository;
        this.orderItemRepository = orderItemRepository;
    }

    @Transactional(readOnly = true)
    @Cacheable("products")
    public List<ProductDto> listActiveProducts() {
        Map<String, Long> sold = soldCounts();
        return productRepository.findAllActive().stream()
                .map(p -> toDto(p, sold))
                .toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "productById", key = "#id")
    public Optional<ProductDto> getProduct(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        return productRepository.findByIdWithDetails(key)
                .filter(p -> p.isActive() && !p.isArchived())
                .map(p -> toDto(p, soldCounts()));
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
    @Cacheable("tags")
    public List<TagDto> listTags() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(t -> new TagDto(UuidUtil.toString(t.getId()), t.getName()))
                .toList();
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
                tags);
    }

    private TagDto toTagDto(Tag t) {
        return new TagDto(UuidUtil.toString(t.getId()), t.getName());
    }
}
