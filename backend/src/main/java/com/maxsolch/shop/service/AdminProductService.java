package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.Brand;
import com.maxsolch.shop.catalog.BrandAdminService;
import com.maxsolch.shop.catalog.CardStatus;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.catalog.ProductCatalogFields;
import com.maxsolch.shop.catalog.ProductCondition;
import com.maxsolch.shop.catalog.SpecsJson;
import com.maxsolch.shop.catalog.SpecsValidator;
import com.maxsolch.shop.common.AfterCommit;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.ProductImageDto;
import com.maxsolch.shop.web.dto.ProductUpsertRequest;
import com.maxsolch.shop.web.dto.ProductVariantDto;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * Admin product CRUD + catalog fields (category, brand, condition, characteristics, card status) +
 * variant/image management. Mutations evict the public catalog caches.
 *
 * <p>Unfinished products (owner, 2026-10-09): a new product needs a title, a price &gt; 0, a stock
 * and a leaf category, and is created HIDDEN as a DRAFT card. Turning a product active needs a price
 * and a category ({@code PRODUCT_NOT_PUBLISHABLE}) and a card that is not a DRAFT
 * ({@code CARD_NOT_READY}, bypassed by {@code force}). Products already active stay active.
 */
@Service
public class AdminProductService {

    public static final String CARD_NOT_READY = "CARD_NOT_READY";
    public static final String NOT_PUBLISHABLE = "PRODUCT_NOT_PUBLISHABLE";

    private final ProductRepository productRepository;
    private final ImageStorageService imageStorageService;
    private final SlugService slugService;
    private final TranslationService translationService;
    private final CatalogDirectory catalogDirectory;
    private final BrandAdminService brandService;

    public AdminProductService(ProductRepository productRepository,
                               ImageStorageService imageStorageService,
                               SlugService slugService,
                               TranslationService translationService,
                               CatalogDirectory catalogDirectory,
                               BrandAdminService brandService) {
        this.productRepository = productRepository;
        this.imageStorageService = imageStorageService;
        this.slugService = slugService;
        this.translationService = translationService;
        this.catalogDirectory = catalogDirectory;
        this.brandService = brandService;
    }

    @Transactional(readOnly = true)
    public List<AdminProductDto> list() {
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        return productRepository.findAllNotArchived().stream().map(p -> toAdminDto(p, catalog)).toList();
    }

    @Transactional(readOnly = true)
    public List<AdminProductDto> listArchived() {
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        return productRepository.findAllArchived().stream().map(p -> toAdminDto(p, catalog)).toList();
    }

    @Transactional(readOnly = true)
    public AdminProductDto get(String id) {
        return toAdminDto(load(id), catalogDirectory.snapshot());
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto create(ProductUpsertRequest req) {
        if (req.title() != null && productRepository.existsByTitle(req.title().trim())) {
            throw new BadRequestException("product title already exists");
        }
        if (req.priceMinor() <= 0) {
            throw new BadRequestException("priceMinor: укажите цену больше 0");
        }
        if (req.stock() == null) {
            throw new BadRequestException("stock: укажите остаток (0 и больше)");
        }
        if (trimToNull(req.categoryId()) == null) {
            throw new BadRequestException("categoryId: выберите категорию");
        }
        Product p = new Product();
        applyScalars(p, req);
        applyImages(p, req);
        CatalogSnapshot catalog = catalogDirectory.load();
        List<SpecsValidator.Issue> issues = applyCatalog(p, req, catalog);
        // Unfinished until the card is done: hidden, DRAFT — whatever the form asked for.
        p.setActive(false);
        p.setCardStatus(CardStatus.DRAFT);
        applyVariants(p, req);
        return toAdminDto(productRepository.save(p), catalogDirectory.load()).withSpecIssues(issues);
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto update(String id, ProductUpsertRequest req) {
        return update(id, req, false);
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto update(String id, ProductUpsertRequest req, boolean force) {
        // Row lock on the product: checkout reserves stock under the same lock, so the
        // expectedStock comparison below cannot race with an order being placed.
        Product p = productRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new NotFoundException("product not found"));
        if (req.title() != null && !req.title().trim().equalsIgnoreCase(p.getTitle())
                && productRepository.existsByTitle(req.title().trim())) {
            throw new BadRequestException("product title already exists");
        }
        boolean wasActive = p.isActive();
        applyScalars(p, req);
        applyImages(p, req);
        CatalogSnapshot catalog = catalogDirectory.load();
        List<SpecsValidator.Issue> issues = applyCatalog(p, req, catalog);
        if (!wasActive && p.isActive()) {
            checkPublishable(p, force);
        }
        List<byte[]> removedVariants = applyVariants(p, req);
        AdminProductDto saved = toAdminDto(productRepository.save(p), catalogDirectory.load()).withSpecIssues(issues);
        // Removed variants are hard-deleted (orphanRemoval); their translations have no FK.
        translationService.deleteForEntities(TranslationEntityType.VARIANT, removedVariants);
        return saved;
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto setActive(String id, boolean active) {
        return setActive(id, active, false);
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto setActive(String id, boolean active, boolean force) {
        Product p = load(id);
        if (active && !p.isActive()) {
            checkPublishable(p, force);
        }
        p.setActive(active);
        return toAdminDto(productRepository.save(p), catalogDirectory.snapshot());
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto setArchived(String id, boolean archived) {
        Product p = load(id);
        p.setArchived(archived);
        return toAdminDto(productRepository.save(p), catalogDirectory.snapshot());
    }

    /** «Проверено» / back to the queue — the work state of the card only. */
    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    @Transactional
    public AdminProductDto setCardStatus(String id, String status, Long adminId) {
        CardStatus st = CardStatus.parse(status);
        if (st == null) {
            throw new BadRequestException("status: DRAFT | AI_FILLED | READY");
        }
        Product p = load(id);
        setStatus(p, st, adminId);
        return toAdminDto(productRepository.save(p), catalogDirectory.snapshot());
    }

    // ------------------------------------------------------------------ publishing gate

    /** What is missing to publish: {@code price} (must be &gt; 0) and {@code category}. Empty = ok. */
    public static List<String> missingForPublish(Product p) {
        List<String> missing = new ArrayList<>();
        if (p.getPriceMinor() <= 0) {
            missing.add("price");
        }
        if (p.getCategoryId() == null) {
            missing.add("category");
        }
        return missing;
    }

    /** Gate of the transition to active (see the class comment). */
    public static void checkPublishable(Product p, boolean force) {
        List<String> missing = missingForPublish(p);
        if (!missing.isEmpty()) {
            throw new ConflictException("Нельзя выложить: " + String.join(", ", missing.stream()
                    .map(m -> "price".equals(m) ? "нет цены" : "нет категории").toList()), NOT_PUBLISHABLE,
                    Map.of("missing", missing));
        }
        if (!force && (p.getCardStatus() == null || p.getCardStatus() == CardStatus.DRAFT)) {
            throw new ConflictException("Карточка не оформлена (черновик) — оформите её или выложите без оформления",
                    CARD_NOT_READY);
        }
    }

    /** Sets the card status; READY records who reviewed it and when (card_meta). */
    public static void setStatus(Product p, CardStatus st, Long adminId) {
        p.setCardStatus(st);
        if (st == CardStatus.READY) {
            Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
            meta.put("reviewedAt", Instant.now().toString());
            if (adminId != null) {
                meta.put("reviewedBy", adminId);
            }
            p.setCardMetaJson(SpecsJson.write(meta));
        }
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
        // null = the admin did not touch the field, so units sold meanwhile are not overwritten.
        if (req.stock() != null) {
            checkStock(p.getStock(), req.stock(), req.expectedStock(), p.getTitle());
            p.setStock(req.stock());
        }
        if (req.active() != null) {
            p.setActive(req.active());
        }
        applyStorefront(p, req);
    }

    /**
     * Site-only fields. {@code null} keeps the current value (older admin builds do not send
     * them); a blank slug means "generate from the title", a hand-typed one must be free.
     */
    private void applyStorefront(Product p, ProductUpsertRequest req) {
        if (req.slug() != null || p.getSlug() == null) {
            String explicit = req.slug() == null ? "" : req.slug().trim();
            if (!explicit.isEmpty()) {
                String normalised = SlugService.slugify(explicit);
                if (normalised.isEmpty()) {
                    throw new BadRequestException("slug: допустимы латиница, цифры и дефис");
                }
                if (!normalised.equals(p.getSlug()) && slugService.productSlugTaken(normalised, p.getId())) {
                    throw new BadRequestException("slug «" + normalised + "» уже занят другим товаром");
                }
                p.setSlug(normalised);
            } else {
                p.setSlug(slugService.forProduct(null, p.getTitle(), p.getId()));
            }
        }
        if (req.compareAtMinor() != null) {
            p.setCompareAtMinor(req.compareAtMinor() > 0 ? req.compareAtMinor() : null);
        }
        if (req.seoTitle() != null) {
            p.setSeoTitle(trimToNull(req.seoTitle()));
        }
        if (req.seoDescription() != null) {
            p.setSeoDescription(trimToNull(req.seoDescription()));
        }
        if (req.sku() != null) {
            String sku = trimToNull(req.sku());
            if (sku != null && !sku.equalsIgnoreCase(p.getSku()) && productRepository.skuTaken(sku, p.getId())) {
                throw new BadRequestException("артикул «" + sku + "» уже есть у другого товара");
            }
            p.setSku(sku);
        }
    }

    /**
     * Category, brand, condition, characteristics and card status (§3.3); {@code null} keeps. The
     * characteristics are validated against the (new) category: a changed category re-checks the
     * stored ones too. Manual edits never change the card status (only an explicit cardStatus does).
     *
     * @return what the validator dropped
     */
    List<SpecsValidator.Issue> applyCatalog(Product p, ProductUpsertRequest req, CatalogSnapshot catalog) {
        boolean categoryChanged = false;
        if (req.categoryId() != null) {
            String cid = req.categoryId().trim();
            if (cid.isEmpty()) {
                categoryChanged = p.getCategoryId() != null;
                p.setCategoryId(null);
            } else {
                CatalogSnapshot.Cat c = catalog.category(normalizeId(cid));
                if (c == null) {
                    throw new BadRequestException("categoryId: категория не найдена");
                }
                if (!catalog.isLeaf(c.id())) {
                    throw new BadRequestException("categoryId: «" + c.name()
                            + "» — раздел с подкатегориями, выберите подкатегорию");
                }
                byte[] next = UuidUtil.toBytes(c.id());
                categoryChanged = !Arrays.equals(next, p.getCategoryId());
                p.setCategoryId(next);
            }
        }
        if (req.brandId() != null) {
            String bid = req.brandId().trim();
            if (bid.isEmpty()) {
                p.setBrandId(null);
            } else {
                CatalogSnapshot.BrandInfo b = catalog.brand(normalizeId(bid));
                if (b == null) {
                    throw new BadRequestException("brandId: бренд не найден");
                }
                p.setBrandId(UuidUtil.toBytes(b.id()));
            }
        } else if (req.brandName() != null) {
            Brand b = brandService.findOrCreate(req.brandName(), null);
            p.setBrandId(b == null ? null : b.getId());
        }
        if (req.condition() != null) {
            ProductCondition c = ProductCondition.parse(req.condition());
            if (c == null) {
                throw new BadRequestException("condition: NEW | MARKDOWN | USED");
            }
            p.setCondition(c);
        }
        if (req.conditionNote() != null) {
            p.setConditionNote(trimToNull(req.conditionNote()));
        }
        List<SpecsValidator.Issue> issues = List.of();
        String categoryId = ProductCatalogFields.categoryId(p);
        if (req.specs() != null || categoryChanged) {
            Map<String, Object> raw = req.specs() != null ? req.specs() : SpecsJson.readMap(p.getSpecsJson());
            SpecsValidator.Result r = SpecsValidator.validate(catalog.attributesFor(categoryId), raw);
            p.setSpecsJson(SpecsJson.write(r.specs()));
            issues = r.issues();
        }
        if (req.cardStatus() != null) {
            CardStatus st = CardStatus.parse(req.cardStatus());
            if (st == null) {
                throw new BadRequestException("cardStatus: DRAFT | AI_FILLED | READY");
            }
            if (st != p.getCardStatus()) {
                setStatus(p, st, null);
            }
        }
        return issues;
    }

    private static String normalizeId(String id) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(id));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid id: " + id);
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

        // After the commit: the save can still fail after this point (unknown category, duplicate slug
        // on flush), and a rollback would leave product_images rows pointing at deleted files.
        if (!orphanKeys.isEmpty()) {
            AfterCommit.run(() -> orphanKeys.forEach(imageStorageService::deleteQuietly));
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
    private List<byte[]> applyVariants(Product p, ProductUpsertRequest req) {
        if (req.variants() == null) {
            return List.of();
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
            if (vi.stock() != null) {
                if (v.getId() != null) {
                    checkStock(v.getStock(), vi.stock(), vi.expectedStock(),
                            p.getTitle() + " / " + v.getName());
                }
                v.setStock(vi.stock());
            }
            v.setSortOrder(order++);
            keep.add(v);
            rollup += v.getStock();
        }

        // Anything not matched was removed by the admin (orphanRemoval deletes the rows).
        List<byte[]> removed = p.getVariants().stream()
                .filter(v -> !keep.contains(v) && v.getId() != null)
                .map(ProductVariant::getId)
                .toList();
        p.getVariants().removeIf(v -> !keep.contains(v));

        // Product stock is the rollup of variant stock whenever variants exist (OrderService
        // relies on the same invariant when reserving/releasing units).
        if (!p.getVariants().isEmpty()) {
            p.setStock(rollup);
        }
        return removed;
    }

    /**
     * Lost-update guard for stock (A5): the form sends the value it was opened with as
     * {@code expected}; if the stored value moved since (an order reserved or released units)
     * and the admin is changing it, reject instead of overwriting. No-op when nothing changes
     * or the client sent no expectation.
     */
    static void checkStock(int current, int requested, Integer expected, String label) {
        if (expected == null || requested == current || expected == current) {
            return;
        }
        throw new ConflictException("Остаток «" + label + "» изменился (было " + expected
                + ", стало " + current + ") — обновите", "STOCK_CONFLICT");
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

    public static AdminProductDto toAdminDto(Product p, CatalogSnapshot catalog) {
        List<ProductImageDto> images = p.getImages().stream()
                .map(i -> new ProductImageDto(i.getId(), i.getUrl(), i.getSortOrder()))
                .toList();
        List<ProductVariantDto> variants = p.getVariants().stream()
                .map(v -> new ProductVariantDto(UuidUtil.toString(v.getId()), v.getName(), v.getStock(), v.getSortOrder()))
                .toList();
        String categoryId = ProductCatalogFields.categoryId(p);
        BrandRefDto brandRef = ProductCatalogFields.brandRef(catalog, ProductCatalogFields.brandId(p));
        Map<String, Object> specs = ProductCatalogFields.specs(p);
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
                ProductCatalogFields.tags(catalog, categoryId),
                p.getSlug(),
                p.getCompareAtMinor(),
                p.getSeoTitle(),
                p.getSeoDescription(),
                brandRef == null ? null : brandRef.name(),
                p.getSku(),
                categoryId,
                brandRef,
                ProductCatalogFields.condition(p),
                p.getConditionNote(),
                specs,
                (p.getCardStatus() == null ? CardStatus.DRAFT : p.getCardStatus()).name(),
                p.getCardConfidence(),
                SpecsJson.readMap(p.getCardMetaJson()),
                catalog.missingRequired(categoryId, specs),
                null);
    }
}
