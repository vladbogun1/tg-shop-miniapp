package com.maxsolch.shop.gift;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.gift.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.GiftDtos.CaseItemRequest;
import com.maxsolch.shop.gift.GiftDtos.GiftStatsDto;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ProductDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class AdminGiftService {

    /** The admin reads the Russian source texts. */
    private static final String ADMIN_LANG = "ru";

    private final GiftCaseItemRepository caseRepository;
    private final CatalogService catalogService;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;

    public AdminGiftService(GiftCaseItemRepository caseRepository, CatalogService catalogService,
                            AdminAuditService audit, JdbcTemplate jdbc) {
        this.caseRepository = caseRepository;
        this.catalogService = catalogService;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public GiftStatsDto stats() {
        Instant since = Instant.now().minus(Duration.ofDays(30));
        // REJECTED orders are left out: the gift was not really given.
        return jdbc.queryForObject("""
                select count(*) orders,
                       coalesce(sum(exists(select 1 from order_items i where i.order_id = o.id and i.auto_gift)), 0) gift_orders,
                       coalesce(sum(o.gift_case_status is not null), 0) case_orders,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) cases_opened
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED'
                """, (rs, n) -> new GiftStatsDto(since, rs.getLong("orders"), rs.getLong("gift_orders"),
                rs.getLong("case_orders"), rs.getLong("cases_opened")),
                Timestamp.from(since));
    }

    @Transactional(readOnly = true)
    public List<CaseItemAdminDto> caseItems() {
        List<GiftCaseItem> items = caseRepository.findAllByOrderBySortOrderAscIdAsc();
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(ADMIN_LANG).forEach(p -> byId.put(p.id(), p));
        // Chances as the checkout draws them: active prizes whose product is visible and in stock.
        long total = items.stream()
                .filter(i -> i.isActive() && inStock(byId.get(UuidUtil.toString(i.getProductId()))))
                .mapToLong(GiftCaseItem::getWeight).sum();
        List<CaseItemAdminDto> out = new ArrayList<>();
        for (GiftCaseItem i : items) {
            out.add(caseDto(i, byId.get(UuidUtil.toString(i.getProductId())), total));
        }
        return out;
    }

    @Transactional
    public CaseItemAdminDto addCaseItem(CaseItemRequest body) {
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
        item.setWeight(weight(body.weight(), 10 * GiftService.CASE_WEIGHT_PER_PERCENT));
        item.setSortOrder(body.sortOrder() != null ? body.sortOrder()
                : caseRepository.findAll().stream().mapToInt(GiftCaseItem::getSortOrder).max().orElse(0) + 10);
        item.setActive(body.active() == null || body.active());
        GiftCaseItem saved = caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_CREATE", "GIFT_CASE_ITEM", String.valueOf(saved.getId()),
                p.title() + " · " + saved.getRarity() + " · вес " + saved.getWeight());
        return caseItems().stream().filter(d -> d.id() == saved.getId()).findFirst().orElseThrow();
    }

    @Transactional
    public CaseItemAdminDto updateCaseItem(long id, CaseItemRequest body) {
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

    private static CaseItemAdminDto caseDto(GiftCaseItem i, ProductDto p, long total) {
        boolean live = i.isActive() && inStock(p);
        double chance = live ? GiftService.chancePercent(i.getWeight(), total) : 0;
        return new CaseItemAdminDto(i.getId(), UuidUtil.toString(i.getProductId()),
                p == null ? "(товар скрыт или удалён)" : p.title(), GiftService.image(p), p == null ? 0 : p.priceMinor(),
                p == null ? 0 : p.effectiveStock(), p != null, i.getRarity().name(), i.getWeight(), chance,
                i.getSortOrder(), i.isActive());
    }

    private static GiftCaseItem.Rarity rarity(String value, GiftCaseItem.Rarity def) {
        if (value == null || value.isBlank()) {
            return def;
        }
        try {
            return GiftCaseItem.Rarity.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неизвестная редкость: " + value);
        }
    }

    private static int weight(Integer value, int def) {
        if (value == null) {
            return def;
        }
        if (value < 0 || value > 100 * GiftService.CASE_WEIGHT_PER_PERCENT) {
            throw new BadRequestException("Шанс — от 0 до 100 %");
        }
        return value;
    }
}
