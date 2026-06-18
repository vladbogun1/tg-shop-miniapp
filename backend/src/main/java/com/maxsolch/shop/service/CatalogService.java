package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.ProductImageDto;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class CatalogService {

    private final ProductRepository productRepository;
    private final TagRepository tagRepository;

    public CatalogService(ProductRepository productRepository, TagRepository tagRepository) {
        this.productRepository = productRepository;
        this.tagRepository = tagRepository;
    }

    @Transactional(readOnly = true)
    @Cacheable("products")
    public List<ProductDto> listActiveProducts() {
        return productRepository.findAllActive().stream()
                .map(this::toDto)
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
                .map(this::toDto);
    }

    @Transactional(readOnly = true)
    @Cacheable("tags")
    public List<TagDto> listTags() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(t -> new TagDto(UuidUtil.toString(t.getId()), t.getName()))
                .toList();
    }

    private ProductDto toDto(Product p) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(), v.getStock(), v.getSortOrder()))
                .toList();
        List<TagDto> tags = p.getTags().stream()
                .map(this::toTagDto)
                .toList();
        return new ProductDto(
                UuidUtil.toString(p.getId()),
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.isActive(),
                0L, // soldCount placeholder for Phase 1
                images,
                variants,
                tags);
    }

    private TagDto toTagDto(Tag t) {
        return new TagDto(UuidUtil.toString(t.getId()), t.getName());
    }
}
