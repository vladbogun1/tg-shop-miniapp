package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.ProductImageDto;
import com.maxsolch.shop.web.dto.ProductUpsertRequest;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Admin product CRUD + tag/variant/image management. Mutations evict the public catalog caches.
 */
@Service
public class AdminProductService {

    private final ProductRepository productRepository;
    private final TagRepository tagRepository;

    public AdminProductService(ProductRepository productRepository, TagRepository tagRepository) {
        this.productRepository = productRepository;
        this.tagRepository = tagRepository;
    }

    @Transactional(readOnly = true)
    public List<AdminProductDto> list() {
        return productRepository.findAllNotArchived().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<AdminProductDto> listArchived() {
        return productRepository.findAllArchived().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public AdminProductDto get(String id) {
        return toDto(load(id));
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "tags", allEntries = true)
    })
    @Transactional
    public AdminProductDto create(ProductUpsertRequest req) {
        if (req.title() != null && productRepository.existsByTitle(req.title().trim())) {
            throw new BadRequestException("product title already exists");
        }
        Product p = new Product();
        applyScalars(p, req);
        applyImages(p, req);
        applyTags(p, req);
        applyVariants(p, req);
        return toDto(productRepository.save(p));
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "tags", allEntries = true)
    })
    @Transactional
    public AdminProductDto update(String id, ProductUpsertRequest req) {
        Product p = load(id);
        applyScalars(p, req);
        applyImages(p, req);
        applyTags(p, req);
        applyVariants(p, req);
        return toDto(productRepository.save(p));
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    @Transactional
    public AdminProductDto setActive(String id, boolean active) {
        Product p = load(id);
        p.setActive(active);
        return toDto(productRepository.save(p));
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    @Transactional
    public AdminProductDto setArchived(String id, boolean archived) {
        Product p = load(id);
        p.setArchived(archived);
        return toDto(productRepository.save(p));
    }

    // ----- internals -----

    private void applyScalars(Product p, ProductUpsertRequest req) {
        if (req.title() != null) {
            p.setTitle(req.title().trim());
        }
        p.setDescription(req.description());
        p.setPriceMinor(req.priceMinor());
        if (req.currency() != null && !req.currency().isBlank()) {
            p.setCurrency(req.currency().trim());
        }
        // base product stock: kept in sync with rolled-up variant stock if variants present.
        p.setStock(req.stock());
        if (req.active() != null) {
            p.setActive(req.active());
        }
    }

    private void applyImages(Product p, ProductUpsertRequest req) {
        if (req.imageKeys() == null) {
            return;
        }
        p.getImages().clear();
        int order = 0;
        for (String key : req.imageKeys()) {
            if (key == null || key.isBlank()) {
                continue;
            }
            ProductImage img = new ProductImage();
            img.setProduct(p);
            img.setUrl(key.trim());
            img.setSortOrder(order++);
            p.getImages().add(img);
        }
    }

    private void applyTags(Product p, ProductUpsertRequest req) {
        if (req.tagIds() == null) {
            return;
        }
        p.getTags().clear();
        for (String tagId : req.tagIds()) {
            if (tagId == null || tagId.isBlank()) {
                continue;
            }
            Tag tag = tagRepository.findById(toBytes(tagId))
                    .orElseThrow(() -> new BadRequestException("unknown tag: " + tagId));
            p.getTags().add(tag);
        }
    }

    private void applyVariants(Product p, ProductUpsertRequest req) {
        if (req.variants() == null) {
            return;
        }
        p.getVariants().clear();
        int order = 0;
        int rollup = 0;
        for (ProductUpsertRequest.VariantInput vi : req.variants()) {
            if (vi.name() == null || vi.name().isBlank()) {
                continue;
            }
            ProductVariant v = new ProductVariant();
            v.setProduct(p);
            v.setName(vi.name().trim());
            v.setStock(vi.stock());
            v.setSortOrder(order++);
            p.getVariants().add(v);
            rollup += vi.stock();
        }
        // Roll up variant stock into product stock when variants exist.
        if (!p.getVariants().isEmpty()) {
            p.setStock(rollup);
        }
    }

    private Product load(String id) {
        return productRepository.findByIdWithDetails(toBytes(id))
                .orElseThrow(() -> new NotFoundException("product not found"));
    }

    private byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid id: " + id);
        }
    }

    private AdminProductDto toDto(Product p) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(), v.getStock(), v.getSortOrder()))
                .toList();
        List<TagDto> tags = p.getTags().stream()
                .map(t -> new TagDto(UuidUtil.toString(t.getId()), t.getName()))
                .toList();
        return new AdminProductDto(
                UuidUtil.toString(p.getId()),
                p.getTitle(),
                p.getDescription(),
                p.getPriceMinor(),
                p.getCurrency(),
                p.getStock(),
                p.isActive(),
                p.isArchived(),
                images,
                variants,
                tags);
    }
}
