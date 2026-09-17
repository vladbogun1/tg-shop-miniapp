package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.media.ImageStorageService;
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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Admin product CRUD + tag/variant/image management. Mutations evict the public catalog caches.
 */
@Service
public class AdminProductService {

    private final ProductRepository productRepository;
    private final TagRepository tagRepository;
    private final ImageStorageService imageStorageService;

    public AdminProductService(ProductRepository productRepository,
                               TagRepository tagRepository,
                               ImageStorageService imageStorageService) {
        this.productRepository = productRepository;
        this.tagRepository = tagRepository;
        this.imageStorageService = imageStorageService;
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
        if (req.title() != null && !req.title().trim().equalsIgnoreCase(p.getTitle())
                && productRepository.existsByTitle(req.title().trim())) {
            throw new BadRequestException("product title already exists");
        }
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

    /**
     * Reconciles the image list against what the client sent, matching on the stored key.
     *
     * <p>Rewriting the whole collection (clear + re-insert) churned primary keys on every save and,
     * worse, left every removed picture in object storage forever. Now rows that survive are reused
     * (only their sort order moves) and dropped ones are deleted from MinIO as well.
     */
    private void applyImages(Product p, ProductUpsertRequest req) {
        if (req.imageKeys() == null) {
            return;
        }
        List<String> keys = req.imageKeys().stream()
                .filter(k -> k != null && !k.isBlank())
                .map(String::trim)
                .distinct()
                .toList();

        // Drop what the admin removed. The collection is mutated in place rather than cleared and
        // refilled: with orphanRemoval a clear() schedules every row for deletion, and re-adding
        // the same instances in one flush is exactly the pattern that makes Hibernate delete and
        // re-insert (new ids) — which is the bug being fixed here.
        List<String> orphanKeys = p.getImages().stream()
                .map(ProductImage::getUrl)
                .filter(url -> !keys.contains(url))
                .toList();
        p.getImages().removeIf(img -> !keys.contains(img.getUrl()));

        Map<String, ProductImage> existing = new LinkedHashMap<>();
        for (ProductImage img : p.getImages()) {
            existing.putIfAbsent(img.getUrl(), img);
        }
        int order = 0;
        for (String key : keys) {
            ProductImage img = existing.get(key);
            if (img == null) {
                img = new ProductImage();
                img.setProduct(p);
                img.setUrl(key);
                p.getImages().add(img);
            }
            img.setSortOrder(order++);
        }

        orphanKeys.forEach(imageStorageService::deleteQuietly);
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

    /**
     * Reconciles variants instead of recreating them.
     *
     * <p>The previous clear + re-insert handed every variant a brand new UUID on each save, which
     * silently broke anything holding the old one: persisted carts in customers' browsers and the
     * {@code order_items.variant_id} of existing orders. Matching is by id when the client sends
     * one, then by name (the admin UI historically sent no ids at all), so existing rows keep their
     * identity either way; only genuinely removed variants are deleted.
     */
    private void applyVariants(Product p, ProductUpsertRequest req) {
        if (req.variants() == null) {
            return;
        }
        Map<String, ProductVariant> byId = new LinkedHashMap<>();
        Map<String, ProductVariant> byName = new LinkedHashMap<>();
        for (ProductVariant v : p.getVariants()) {
            byId.put(UuidUtil.toString(v.getId()), v);
            byName.putIfAbsent(normalized(v.getName()), v);
        }

        // Resolve every incoming variant to an existing row (by id, else by name) or a new one.
        List<ProductVariant> keep = new ArrayList<>();
        int order = 0;
        int rollup = 0;
        for (ProductUpsertRequest.VariantInput vi : req.variants()) {
            if (vi.name() == null || vi.name().isBlank()) {
                continue;
            }
            ProductVariant v = null;
            if (vi.id() != null && !vi.id().isBlank()) {
                v = byId.remove(vi.id().trim());
                if (v != null) {
                    byName.remove(normalized(v.getName()));
                }
            }
            if (v == null) {
                v = byName.remove(normalized(vi.name()));
                if (v != null) {
                    byId.remove(UuidUtil.toString(v.getId()));
                }
            }
            if (v == null) {
                v = new ProductVariant();
                v.setProduct(p);
                p.getVariants().add(v);
            }
            v.setName(vi.name().trim());
            v.setStock(vi.stock());
            v.setSortOrder(order++);
            keep.add(v);
            rollup += vi.stock();
        }

        // Anything not matched was removed by the admin (orphanRemoval deletes the rows).
        p.getVariants().removeIf(v -> !keep.contains(v));

        // Product stock is the rollup of variant stock whenever variants exist (OrderService
        // relies on the same invariant when reserving/releasing units).
        if (!p.getVariants().isEmpty()) {
            p.setStock(rollup);
        }
    }

    private static String normalized(String name) {
        return name == null ? "" : name.trim().toLowerCase(java.util.Locale.ROOT);
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
