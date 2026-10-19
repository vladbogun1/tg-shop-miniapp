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

    public AdminBundleService(BundleRuleRepository repository, BundleService bundles, CatalogDirectory directory,
                              CatalogService catalogService, SettingsService settings, AdminAuditService audit,
                              JdbcTemplate jdbc) {
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
        // REJECTED orders are left out: the discount was not really given.
        return jdbc.queryForObject("""
                select count(*) orders,
                       coalesce(sum(o.bundle_discount_minor > 0), 0) bundle_orders,
                       coalesce(sum(o.bundle_discount_minor), 0) bundle_discount,
                       coalesce(sum(case when o.bundle_discount_minor > 0 then o.total_minor else 0 end), 0) bundle_revenue
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED'
                """, (rs, n) -> new StatsDto(since, rs.getLong("orders"), rs.getLong("bundle_orders"),
                rs.getLong("bundle_discount"), rs.getLong("bundle_revenue")),
                Timestamp.from(since));
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
