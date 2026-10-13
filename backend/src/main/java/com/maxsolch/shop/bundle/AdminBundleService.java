package com.maxsolch.shop.bundle;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleDto;
import com.maxsolch.shop.bundle.BundleDtos.RuleRequest;
import com.maxsolch.shop.bundle.BundleDtos.StatsDto;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
public class AdminBundleService {

    /** The admin reads the Russian source texts. */
    private static final String ADMIN_LANG = "ru";

    private final BundleRuleRepository repository;
    private final BundleService bundles;
    private final CatalogDirectory directory;
    private final CatalogService catalogService;
    private final SettingsService settings;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;
    private final GiftCaseItemRepository caseRepository;

    public AdminBundleService(BundleRuleRepository repository, BundleService bundles, CatalogDirectory directory,
                              CatalogService catalogService, SettingsService settings, AdminAuditService audit,
                              JdbcTemplate jdbc, GiftCaseItemRepository caseRepository) {
        this.caseRepository = caseRepository;
        this.repository = repository;
        this.bundles = bundles;
        this.directory = directory;
        this.catalogService = catalogService;
        this.settings = settings;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public List<RuleDto> rules() {
        CatalogSnapshot snap = directory.snapshot();
        return repository.findAllByOrderBySortOrderAscIdAsc().stream().map(r -> dto(r, snap)).toList();
    }

    @Transactional
    public RuleDto create(RuleRequest body) {
        if (body == null) {
            throw new BadRequestException("пустой запрос");
        }
        CatalogSnapshot snap = directory.snapshot();
        CatalogSnapshot.Cat source = category(snap, body.sourceCategoryId(), "основного товара");
        CatalogSnapshot.Cat target = category(snap, body.targetCategoryId(), "аксессуара");
        if (source.id().equals(target.id())) {
            throw new BadRequestException("Категории товара и аксессуара должны отличаться");
        }
        byte[] s = UuidUtil.toBytes(source.id());
        byte[] t = UuidUtil.toBytes(target.id());
        if (repository.existsBySourceCategoryIdAndTargetCategoryId(s, t)) {
            throw new BadRequestException("Такая пара уже есть: " + source.name() + " → " + target.name());
        }
        BundleRule r = new BundleRule();
        r.setSourceCategoryId(s);
        r.setTargetCategoryId(t);
        r.setSortOrder(body.sortOrder() != null ? body.sortOrder()
                : repository.findAll().stream().mapToInt(BundleRule::getSortOrder).max().orElse(0) + 10);
        r.setActive(body.active() == null || body.active());
        BundleRule saved = repository.save(r);
        audit.record("BUNDLE_RULE_CREATE", "BUNDLE_RULE", String.valueOf(saved.getId()),
                source.name() + " → " + target.name());
        return dto(saved, snap);
    }

    @Transactional
    public RuleDto update(long id, RuleRequest body) {
        BundleRule r = repository.findById(id).orElseThrow(() -> new NotFoundException("пара не найдена"));
        if (body != null && body.sortOrder() != null) {
            r.setSortOrder(body.sortOrder());
        }
        if (body != null && body.active() != null) {
            r.setActive(body.active());
        }
        RuleDto dto = dto(repository.save(r), directory.snapshot());
        audit.record("BUNDLE_RULE_UPDATE", "BUNDLE_RULE", String.valueOf(id),
                dto.sourceCategoryName() + " → " + dto.targetCategoryName()
                        + (r.isActive() ? "" : " (выключена)") + ", порядок " + r.getSortOrder());
        return dto;
    }

    @Transactional
    public void delete(long id) {
        BundleRule r = repository.findById(id).orElseThrow(() -> new NotFoundException("пара не найдена"));
        RuleDto dto = dto(r, directory.snapshot());
        repository.delete(r);
        audit.record("BUNDLE_RULE_DELETE", "BUNDLE_RULE", String.valueOf(id),
                dto.sourceCategoryName() + " → " + dto.targetCategoryName());
    }

    /** The storefront block for a product, even while the feature is switched off. */
    @Transactional(readOnly = true)
    public ProductOfferDto preview(String productId) {
        List<ProductDto> all = catalogService.listActiveProducts(ADMIN_LANG);
        ProductDto anchor = all.stream().filter(p -> p.id().equals(productId)).findFirst()
                .orElseThrow(() -> new NotFoundException("товар не найден или скрыт"));
        List<ProductDto> items = bundles.suggest(List.of(anchor), all, Set.of(productId),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_SUGGESTIONS));
        return new ProductOfferDto(productId, bundles.terms(), items);
    }

    @Transactional(readOnly = true)
    public StatsDto stats() {
        Instant since = Instant.now().minus(Duration.ofDays(30));
        // REJECTED orders are left out: neither the discount nor the gift was really given.
        return jdbc.queryForObject("""
                select count(*) orders,
                       coalesce(sum(o.bundle_discount_minor > 0), 0) bundle_orders,
                       coalesce(sum(o.bundle_discount_minor), 0) bundle_discount,
                       coalesce(sum(case when o.bundle_discount_minor > 0 then o.total_minor else 0 end), 0) bundle_revenue,
                       coalesce(sum(exists(select 1 from order_items i where i.order_id = o.id and i.auto_gift)), 0) gift_orders,
                       coalesce(sum(o.gift_case_status is not null), 0) case_orders,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) cases_opened
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED'
                """, (rs, n) -> new StatsDto(since, rs.getLong("orders"), rs.getLong("bundle_orders"),
                rs.getLong("bundle_discount"), rs.getLong("bundle_revenue"), rs.getLong("gift_orders"),
                rs.getLong("case_orders"), rs.getLong("cases_opened")),
                Timestamp.from(since));
    }

    // ---- gift case prizes ----

    @Transactional(readOnly = true)
    public List<BundleDtos.CaseItemAdminDto> caseItems() {
        List<GiftCaseItem> items = caseRepository.findAllByOrderBySortOrderAscIdAsc();
        java.util.Map<String, ProductDto> byId = new java.util.HashMap<>();
        catalogService.listActiveProducts(ADMIN_LANG).forEach(p -> byId.put(p.id(), p));
        // Chances as the checkout draws them: active prizes whose product is visible and in stock.
        long total = items.stream()
                .filter(i -> i.isActive() && inStock(byId.get(UuidUtil.toString(i.getProductId()))))
                .mapToLong(GiftCaseItem::getWeight).sum();
        List<BundleDtos.CaseItemAdminDto> out = new java.util.ArrayList<>();
        for (GiftCaseItem i : items) {
            out.add(caseDto(i, byId.get(UuidUtil.toString(i.getProductId())), total));
        }
        return out;
    }

    @Transactional
    public BundleDtos.CaseItemAdminDto addCaseItem(BundleDtos.CaseItemRequest body) {
        if (body == null || body.productId() == null || body.productId().isBlank()) {
            throw new BadRequestException("Выберите товар-приз");
        }
        byte[] pid;
        try {
            pid = UuidUtil.toBytes(body.productId().trim());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неверный товар");
        }
        ProductDto p = catalogService.getProduct(body.productId().trim(), ADMIN_LANG)
                .orElseThrow(() -> new BadRequestException("Товар не найден или скрыт"));
        if (caseRepository.existsByProductId(pid)) {
            throw new BadRequestException("Этот товар уже есть в кейсе: " + p.title());
        }
        GiftCaseItem item = new GiftCaseItem();
        item.setProductId(pid);
        item.setRarity(rarity(body.rarity(), GiftCaseItem.Rarity.COMMON));
        item.setWeight(weight(body.weight(), 10 * BundleService.CASE_WEIGHT_PER_PERCENT));
        item.setSortOrder(body.sortOrder() != null ? body.sortOrder()
                : caseRepository.findAll().stream().mapToInt(GiftCaseItem::getSortOrder).max().orElse(0) + 10);
        item.setActive(body.active() == null || body.active());
        GiftCaseItem saved = caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_CREATE", "GIFT_CASE_ITEM", String.valueOf(saved.getId()),
                p.title() + " · " + saved.getRarity() + " · вес " + saved.getWeight());
        return caseItems().stream().filter(d -> d.id() == saved.getId()).findFirst().orElseThrow();
    }

    @Transactional
    public BundleDtos.CaseItemAdminDto updateCaseItem(long id, BundleDtos.CaseItemRequest body) {
        GiftCaseItem item = caseRepository.findById(id).orElseThrow(() -> new NotFoundException("приз не найден"));
        if (body != null) {
            if (body.rarity() != null) {
                item.setRarity(rarity(body.rarity(), item.getRarity()));
            }
            if (body.weight() != null) {
                item.setWeight(weight(body.weight(), item.getWeight()));
            }
            if (body.sortOrder() != null) {
                item.setSortOrder(body.sortOrder());
            }
            if (body.active() != null) {
                item.setActive(body.active());
            }
        }
        caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_UPDATE", "GIFT_CASE_ITEM", String.valueOf(id),
                item.getRarity() + " · вес " + item.getWeight() + (item.isActive() ? "" : " (выключен)"));
        return caseItems().stream().filter(d -> d.id() == id).findFirst().orElseThrow();
    }

    @Transactional
    public void deleteCaseItem(long id) {
        GiftCaseItem item = caseRepository.findById(id).orElseThrow(() -> new NotFoundException("приз не найден"));
        caseRepository.delete(item);
        audit.record("GIFT_CASE_ITEM_DELETE", "GIFT_CASE_ITEM", String.valueOf(id),
                UuidUtil.toString(item.getProductId()));
    }

    private static boolean inStock(ProductDto p) {
        return p != null && p.effectiveStock() > 0;
    }

    private static BundleDtos.CaseItemAdminDto caseDto(GiftCaseItem i, ProductDto p, long total) {
        boolean live = i.isActive() && inStock(p);
        double chance = live ? BundleService.chancePercent(i.getWeight(), total) : 0;
        String img = p == null || p.images() == null || p.images().isEmpty() ? null : p.images().get(0).url();
        return new BundleDtos.CaseItemAdminDto(i.getId(), UuidUtil.toString(i.getProductId()),
                p == null ? "(товар скрыт или удалён)" : p.title(), img, p == null ? 0 : p.priceMinor(),
                p == null ? 0 : p.effectiveStock(), p != null, i.getRarity().name(), i.getWeight(), chance,
                i.getSortOrder(), i.isActive());
    }

    private static GiftCaseItem.Rarity rarity(String value, GiftCaseItem.Rarity def) {
        if (value == null || value.isBlank()) {
            return def;
        }
        try {
            return GiftCaseItem.Rarity.valueOf(value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неизвестная редкость: " + value);
        }
    }

    private static int weight(Integer value, int def) {
        if (value == null) {
            return def;
        }
        if (value < 0 || value > 100 * BundleService.CASE_WEIGHT_PER_PERCENT) {
            throw new BadRequestException("Шанс — от 0 до 100 %");
        }
        return value;
    }

    private static CatalogSnapshot.Cat category(CatalogSnapshot snap, String id, String what) {
        CatalogSnapshot.Cat c = id == null ? null : snap.category(id);
        if (c == null) {
            throw new BadRequestException("Выберите категорию " + what);
        }
        return c;
    }

    private static RuleDto dto(BundleRule r, CatalogSnapshot snap) {
        String s = UuidUtil.toString(r.getSourceCategoryId());
        String t = UuidUtil.toString(r.getTargetCategoryId());
        return new RuleDto(r.getId(), s, name(snap, s), t, name(snap, t), r.getSortOrder(), r.isActive());
    }

    private static String name(CatalogSnapshot snap, String id) {
        CatalogSnapshot.Cat c = snap.category(id);
        if (c == null) {
            return "?";
        }
        CatalogSnapshot.Cat parent = c.parentId() == null ? null : snap.category(c.parentId());
        return parent == null ? c.name() : parent.name() + " › " + c.name();
    }
}
