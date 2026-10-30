package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogErrors;

import com.maxsolch.shop.catalog.domain.Brand;
import com.maxsolch.shop.catalog.domain.CardStatus;
import com.maxsolch.shop.catalog.app.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.ProductCondition;
import com.maxsolch.shop.catalog.domain.SpecsJson;
import com.maxsolch.shop.catalog.domain.SpecsValidator;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.app.TranslationService;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import static com.maxsolch.shop.platform.util.Texts.trimToNull;
import com.maxsolch.shop.catalog.domain.CatalogFilesDropped;
import com.maxsolch.shop.platform.tx.DomainEvents;
import java.time.Clock;

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
    public static final String STOCK_REASON_REQUIRED = "STOCK_REASON_REQUIRED";

    private final ProductRepository productRepository;
    private final ProductStorefront storefront;
    private final TranslationService translationService;
    private final CatalogDirectory catalogDirectory;
    private final BrandAdminService brandService;
    /** FIFO stock lots and write-offs of hand edits (inventory implements it). */
    private final ProductStock stock;
    /** Queues of a product that leaves sale are closed (preorder implements it). */
    private final ProductQueues queues;
    private final DomainEvents events;
    private final Clock clock;

    public AdminProductService(ProductRepository productRepository,
                               ProductStorefront storefront,
                               TranslationService translationService,
                               CatalogDirectory catalogDirectory,
                               BrandAdminService brandService,
                               ProductStock stock,
                               ProductQueues queues,
                               DomainEvents events,
                               Clock clock) {
        this.productRepository = productRepository;
        this.storefront = storefront;
        this.translationService = translationService;
        this.catalogDirectory = catalogDirectory;
        this.brandService = brandService;
        this.stock = stock;
        this.queues = queues;
        this.events = events;
        this.clock = clock;
    }

    private void closeQueues(Product p) {
        queues.closeFor(p.getId());
    }

    /** Files nothing refers to any more are deleted once the change commits. */
    private void dropFiles(List<String> keys) {
        if (!keys.isEmpty()) {
            events.publish(new CatalogFilesDropped(keys));
        }
    }

    private void syncLots(Product p) {
        productRepository.flush(); // new variants get their ids before the lots refer to them
        stock.syncLots(p);
    }

    @Transactional(readOnly = true)
    public List<AdminProductDto> list() {
        return list(null);
    }

    /**
     * The catalog for the admin with how many people wait for each product. {@code sort=demand} — the most
     * wanted first (distinct people, then units), the rest keep the default order.
     */
    @Transactional(readOnly = true)
    public List<AdminProductDto> list(String sort) {
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        Map<String, int[]> waitingBy = queues.waitingByProduct();
        List<AdminProductDto> out = new ArrayList<>(productRepository.findAllNotArchived().stream()
                .map(p -> {
                    int[] w = waitingBy.get(UuidUtil.toString(p.getId()));
                    AdminProductDto dto = toAdminDto(p, catalog);
                    return w == null ? dto : dto.withWaiting(w[0], w[1]);
                }).toList());
        if (sort != null && "demand".equalsIgnoreCase(sort.trim())) {
            out.sort(Comparator.comparingInt(AdminProductDto::waitingPeople).reversed()); // stable: ties keep order
        }
        return out;
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
            throw CatalogErrors.badRequest("product title already exists");
        }
        if (req.priceMinor() <= 0) {
            throw CatalogErrors.badRequest("priceMinor: укажите цену больше 0");
        }
        if (req.stock() == null) {
            throw CatalogErrors.badRequest("stock: укажите остаток (0 и больше)");
        }
        if (trimToNull(req.categoryId()) == null) {
            throw CatalogErrors.badRequest("categoryId: выберите категорию");
        }
        Product p = new Product();
        applyScalars(p, req);
        dropFiles(ProductImagesEditor.apply(p, req));
        CatalogSnapshot catalog = catalogDirectory.load();
        List<SpecsValidator.Issue> issues = applyCatalog(p, req, catalog);
        // Unfinished until the card is done: hidden, DRAFT — whatever the form asked for.
        p.setActive(false);
        p.setCardStatus(CardStatus.DRAFT);
        p.setUnfinished(true);
        ProductVariantsEditor.apply(p, req, null);
        Product created = productRepository.save(p);
        syncLots(created);
        return toAdminDto(created, catalogDirectory.load()).withSpecIssues(issues);
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
                .orElseThrow(() -> CatalogErrors.notFound("product not found"));
        if (req.title() != null && !req.title().trim().equalsIgnoreCase(p.getTitle())
                && productRepository.existsByTitle(req.title().trim())) {
            throw CatalogErrors.badRequest("product title already exists");
        }
        boolean wasActive = p.isActive();
        int productDrop = applyScalars(p, req);
        dropFiles(ProductImagesEditor.apply(p, req));
        CatalogSnapshot catalog = catalogDirectory.load();
        List<SpecsValidator.Issue> issues = applyCatalog(p, req, catalog);
        if (!wasActive && p.isActive()) {
            checkPublishable(p, force);
        }
        syncUnfinished(p);
        List<ProductStock.StockDrop> drops = new ArrayList<>();
        List<byte[]> removedVariants = ProductVariantsEditor.apply(p, req, drops);
        // With variants the product stock is their rollup: only the variant drops count then.
        if (productDrop > 0 && (p.getVariants().isEmpty() || req.variants() == null)) {
            drops.add(new ProductStock.StockDrop(null, null, productDrop));
        }
        stock.recordDrops(p, drops, req.stockReason(), req.stockNote());
        if (wasActive && !p.isActive()) {
            closeQueues(p);
        }
        Product stored = productRepository.save(p);
        syncLots(stored);
        AdminProductDto saved = toAdminDto(stored, catalogDirectory.load()).withSpecIssues(issues);
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
        boolean wasActive = p.isActive();
        p.setActive(active);
        if (wasActive && !active) {
            closeQueues(p);
        }
        syncUnfinished(p);
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
        if (archived) {
            closeQueues(p);
        }
        syncUnfinished(p);
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
            throw CatalogErrors.badRequest("status: DRAFT | AI_FILLED | READY");
        }
        Product p = load(id);
        setStatus(p, st, adminId, clock.instant());
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
            throw CatalogErrors.conflict("Нельзя выложить: " + String.join(", ", missing.stream()
                    .map(m -> "price".equals(m) ? "нет цены" : "нет категории").toList()), NOT_PUBLISHABLE,
                    Map.of("missing", missing));
        }
        if (!force && (p.getCardStatus() == null || p.getCardStatus() == CardStatus.DRAFT)) {
            throw CatalogErrors.conflict("Карточка не оформлена (черновик) — оформите её или выложите без оформления",
                    CARD_NOT_READY);
        }
    }

    /** An unfinished product stops being one once it is published or archived (V53). */
    public static void syncUnfinished(Product p) {
        if (p.isActive() || p.isArchived()) {
            p.setUnfinished(false);
        }
    }

    /** Sets the card status; READY records who reviewed it and when (card_meta). */
    public static void setStatus(Product p, CardStatus st, Long adminId, Instant now) {
        p.setCardStatus(st);
        if (st == CardStatus.READY) {
            Map<String, Object> meta = SpecsJson.readMap(p.getCardMetaJson());
            meta.put("reviewedAt", now.toString());
            if (adminId != null) {
                meta.put("reviewedBy", adminId);
            }
            p.setCardMetaJson(SpecsJson.write(meta));
        }
    }

    // ----- internals -----

    /** @return how many units the product stock dropped by (0 when it did not decrease). */
    private int applyScalars(Product p, ProductUpsertRequest req) {
        int drop = 0;
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
            ProductVariantsEditor.checkStock(p.getStock(), req.stock(), req.expectedStock(), p.getTitle());
            drop = Math.max(0, p.getStock() - req.stock());
            p.setStock(req.stock());
        }
        if (req.active() != null) {
            p.setActive(req.active());
        }
        storefront.apply(p, req);
        return drop;
    }

    /**
     * Category, brand, condition, characteristics and card status (§3.3); {@code null} keeps. The
     * characteristics are validated against the (new) category: a changed category re-checks the
     * stored ones too. Manual edits never change the card status.
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
                    throw CatalogErrors.badRequest("categoryId: категория не найдена");
                }
                if (!catalog.isLeaf(c.id())) {
                    throw CatalogErrors.badRequest("categoryId: «" + c.name()
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
                    throw CatalogErrors.badRequest("brandId: бренд не найден");
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
                throw CatalogErrors.badRequest("condition: NEW | MARKDOWN | USED");
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
        // cardStatus of the form is ignored: a manual save never changes the card status — only the
        // cards import and PATCH /products/{id}/card-status do (an admin form that echoed a stale
        // status used to flip READY cards back to AI_FILLED).
        return issues;
    }

    private static String normalizeId(String id) {
        try {
            return UuidUtil.toString(UuidUtil.toBytes(id));
        } catch (IllegalArgumentException e) {
            throw CatalogErrors.badRequest("invalid id: " + id);
        }
    }

    private Product load(String id) {
        return productRepository.findByIdWithDetails(toBytes(id))
                .orElseThrow(() -> CatalogErrors.notFound("product not found"));
    }

    private byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw CatalogErrors.badRequest("invalid id: " + id);
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
                null,
                p.isUnfinished(),
                0,
                0);
    }
}
