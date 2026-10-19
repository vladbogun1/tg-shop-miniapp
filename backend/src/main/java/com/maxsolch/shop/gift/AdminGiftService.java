package com.maxsolch.shop.gift;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.gift.GiftDtos.CaseItemAdminDto;
import com.maxsolch.shop.gift.GiftDtos.CaseItemRequest;
import com.maxsolch.shop.gift.GiftDtos.GiftStatsDto;
import com.maxsolch.shop.gift.GiftDtos.TierAdminDto;
import com.maxsolch.shop.gift.GiftDtos.TierRequest;
import com.maxsolch.shop.gift.GiftDtos.TierStatsDto;
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
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The gift cases in the admin: tiers, prizes with chances, the numbers (docs/GIFT-CASE.md). */
@Service
public class AdminGiftService {

    /** The admin reads the Russian source texts. */
    private static final String ADMIN_LANG = "ru";

    private final GiftCaseItemRepository caseRepository;
    private final GiftCaseTierRepository tierRepository;
    private final CatalogService catalogService;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;

    public AdminGiftService(GiftCaseItemRepository caseRepository, GiftCaseTierRepository tierRepository,
                            CatalogService catalogService, AdminAuditService audit, JdbcTemplate jdbc) {
        this.caseRepository = caseRepository;
        this.tierRepository = tierRepository;
        this.catalogService = catalogService;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public GiftStatsDto stats() {
        Instant since = Instant.now().minus(Duration.ofDays(30));
        Timestamp ts = Timestamp.from(since);
        // REJECTED orders are left out: the gift was not really given.
        List<TierStatsDto> tiers = jdbc.query("""
                select o.gift_tier tier,
                       coalesce(sum(o.gift_case_status is not null), 0) cases,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) opened,
                       coalesce(sum(o.gift_discount_minor > 0), 0) guaranteed
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED' and o.gift_tier is not null
                 group by o.gift_tier
                """, (rs, n) -> new TierStatsDto(rs.getString("tier"), rs.getLong("cases"), rs.getLong("opened"),
                rs.getLong("guaranteed")), ts);
        tiers = new ArrayList<>(tiers);
        tiers.sort(Comparator.comparingInt(t -> GiftService.parseTier(t.tier()).map(Enum::ordinal).orElse(9)));
        List<TierStatsDto> byTier = List.copyOf(tiers);
        return jdbc.queryForObject("""
                select count(*) orders,
                       coalesce(sum(exists(select 1 from order_items i where i.order_id = o.id and i.auto_gift)), 0) gift_orders,
                       coalesce(sum(o.gift_case_status is not null), 0) case_orders,
                       coalesce(sum(o.gift_case_status = 'OPENED'), 0) cases_opened,
                       coalesce(sum(o.gift_discount_minor > 0), 0) guaranteed_orders,
                       coalesce(sum(o.gift_discount_minor), 0) guaranteed_minor,
                       coalesce(sum(exists(select 1 from order_gift_cases g where g.order_id = o.id and g.swapped_at is not null)), 0) swaps,
                       coalesce(sum(exists(select 1 from order_gift_cases g where g.order_id = o.id and g.kind = 'DISCOUNT')), 0) discount_prizes
                  from orders o
                 where o.created_at >= ? and o.status <> 'REJECTED'
                """, (rs, n) -> new GiftStatsDto(since, rs.getLong("orders"), rs.getLong("gift_orders"),
                rs.getLong("case_orders"), rs.getLong("cases_opened"), rs.getLong("guaranteed_orders"),
                rs.getLong("guaranteed_minor"), rs.getLong("swaps"), rs.getLong("discount_prizes"), byTier), ts);
    }

    // ---- tiers ----

    @Transactional(readOnly = true)
    public List<TierAdminDto> tiers() {
        List<CaseItemAdminDto> items = caseItems();
        return tierRepository.findAll().stream()
                .sorted(Comparator.comparing(GiftCaseTier::getTier))
                .map(t -> {
                    List<CaseItemAdminDto> mine = items.stream().filter(i -> i.tier().equals(t.getTier().name())).toList();
                    List<CaseItemAdminDto> live = mine.stream().filter(i -> i.chancePercent() > 0).toList();
                    // The average product prize as the server draws (discounts are not money spent now).
                    long avg = Math.round(live.stream().filter(i -> "PRODUCT".equals(i.kind()))
                            .mapToDouble(i -> i.chancePercent() / 100 * i.priceMinor()).sum());
                    return new TierAdminDto(t.getTier().name(), t.isEnabled(), t.getThresholdUah(),
                            t.getGuaranteedPercent(), t.getGuaranteedMaxUah(), t.getSwapPercent(), mine.size(),
                            live.size(), avg);
                })
                .toList();
    }

    @Transactional
    public TierAdminDto updateTier(String code, TierRequest body) {
        GiftCaseTier.Tier tier = GiftService.parseTier(code).orElseThrow(() -> new NotFoundException("уровень не найден"));
        GiftCaseTier t = tierRepository.findById(tier).orElseThrow(() -> new NotFoundException("уровень не найден"));
        if (body != null) {
            if (body.enabled() != null) {
                t.setEnabled(body.enabled());
            }
            if (body.thresholdUah() != null) {
                t.setThresholdUah(range(body.thresholdUah(), 1, 1_000_000, "Порог — от 1 до 1 000 000 ₴"));
            }
            if (body.guaranteedPercent() != null) {
                t.setGuaranteedPercent(range(body.guaranteedPercent(), 0, 50, "Гарантированная скидка — от 0 до 50 %"));
            }
            if (body.guaranteedMaxUah() != null) {
                t.setGuaranteedMaxUah(range(body.guaranteedMaxUah(), 0, 100_000, "Потолок скидки — от 0 до 100 000 ₴"));
            }
            if (body.swapPercent() != null) {
                t.setSwapPercent(range(body.swapPercent(), 0, 100, "Замена — от 0 до 100 %"));
            }
        }
        tierRepository.save(t);
        audit.record("GIFT_CASE_TIER_UPDATE", "GIFT_CASE_TIER", tier.name(),
                (t.isEnabled() ? "вкл" : "выкл") + " · от " + t.getThresholdUah() + " ₴ · гарантия "
                        + t.getGuaranteedPercent() + " % (до " + t.getGuaranteedMaxUah() + " ₴) · замена "
                        + t.getSwapPercent() + " %");
        return tiers().stream().filter(d -> d.tier().equals(tier.name())).findFirst().orElseThrow();
    }

    // ---- prizes ----

    @Transactional(readOnly = true)
    public List<CaseItemAdminDto> caseItems() {
        List<GiftCaseItem> items = caseRepository.findAllByOrderBySortOrderAscIdAsc();
        Map<String, ProductDto> byId = new HashMap<>();
        catalogService.listActiveProducts(ADMIN_LANG).forEach(p -> byId.put(p.id(), p));
        // Chances as the checkout draws them, per tier: active prizes that can drop (discounts, products in stock).
        Map<GiftCaseTier.Tier, Long> totals = new EnumMap<>(GiftCaseTier.Tier.class);
        for (GiftCaseItem i : items) {
            if (live(i, byId)) {
                totals.merge(i.getTier(), (long) i.getWeight(), Long::sum);
            }
        }
        List<CaseItemAdminDto> out = new ArrayList<>();
        for (GiftCaseItem i : items) {
            out.add(caseDto(i, i.getProductId() == null ? null : byId.get(UuidUtil.toString(i.getProductId())),
                    totals.getOrDefault(i.getTier(), 0L), live(i, byId)));
        }
        return out;
    }

    @Transactional
    public CaseItemAdminDto addCaseItem(CaseItemRequest body) {
        if (body == null) {
            throw new BadRequestException("Пустой запрос");
        }
        GiftCaseTier.Tier tier = GiftService.parseTier(body.tier())
                .orElseThrow(() -> new BadRequestException("Выберите кейс: бронзовый, серебряный или золотой"));
        GiftCaseItem.Kind kind = kind(body.kind());
        GiftCaseItem item = new GiftCaseItem();
        item.setTier(tier);
        item.setKind(kind);
        String label;
        if (kind == GiftCaseItem.Kind.PRODUCT) {
            if (body.productId() == null || body.productId().isBlank()) {
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
            if (caseRepository.existsByTierAndProductId(tier, pid)) {
                throw new BadRequestException("Этот товар уже есть в этом кейсе: " + p.title());
            }
            item.setProductId(pid);
            label = p.title();
        } else {
            setDiscount(item, body.discountPercent(), body.discountUah());
            label = discountLabel(item);
        }
        item.setRarity(rarity(body.rarity(), GiftCaseItem.Rarity.COMMON));
        item.setWeight(weight(body.weight(), 10 * GiftService.CASE_WEIGHT_PER_PERCENT));
        item.setSortOrder(body.sortOrder() != null ? body.sortOrder()
                : caseRepository.findAll().stream().mapToInt(GiftCaseItem::getSortOrder).max().orElse(0) + 10);
        item.setActive(body.active() == null || body.active());
        GiftCaseItem saved = caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_CREATE", "GIFT_CASE_ITEM", String.valueOf(saved.getId()),
                tier + " · " + label + " · " + saved.getRarity() + " · вес " + saved.getWeight());
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
            if (item.isDiscount() && (body.discountPercent() != null || body.discountUah() != null)) {
                setDiscount(item,
                        body.discountPercent() != null ? body.discountPercent() : (body.discountUah() != null ? 0 : item.getDiscountPercent()),
                        body.discountUah() != null ? body.discountUah() : (body.discountPercent() != null ? 0 : item.getDiscountUah()));
            }
        }
        caseRepository.save(item);
        audit.record("GIFT_CASE_ITEM_UPDATE", "GIFT_CASE_ITEM", String.valueOf(id),
                item.getTier() + " · " + (item.isDiscount() ? discountLabel(item) + " · " : "") + item.getRarity()
                        + " · вес " + item.getWeight() + (item.isActive() ? "" : " (выключен)"));
        return caseItems().stream().filter(d -> d.id() == id).findFirst().orElseThrow();
    }

    @Transactional
    public void deleteCaseItem(long id) {
        GiftCaseItem item = caseRepository.findById(id).orElseThrow(() -> new NotFoundException("приз не найден"));
        caseRepository.delete(item);
        audit.record("GIFT_CASE_ITEM_DELETE", "GIFT_CASE_ITEM", String.valueOf(id),
                item.getTier() + " · " + (item.isDiscount() ? discountLabel(item) : UuidUtil.toString(item.getProductId())));
    }

    private static boolean live(GiftCaseItem i, Map<String, ProductDto> byId) {
        if (!i.isActive() || i.getWeight() <= 0) {
            return false;
        }
        if (i.isDiscount()) {
            return i.getDiscountPercent() > 0 || i.getDiscountUah() > 0;
        }
        return i.getProductId() != null && GiftService.inStock(byId.get(UuidUtil.toString(i.getProductId())));
    }

    private static CaseItemAdminDto caseDto(GiftCaseItem i, ProductDto p, long total, boolean live) {
        double chance = live ? GiftService.chancePercent(i.getWeight(), total) : 0;
        boolean discount = i.isDiscount();
        String title = discount ? discountLabel(i) : p == null ? "(товар скрыт или удалён)" : p.title();
        return new CaseItemAdminDto(i.getId(), i.getTier().name(), i.getKind().name(),
                i.getProductId() == null ? null : UuidUtil.toString(i.getProductId()), title,
                discount ? null : GiftService.image(p), discount || p == null ? 0 : p.priceMinor(),
                discount || p == null ? 0 : p.effectiveStock(), discount || p != null, i.getDiscountPercent(),
                i.getDiscountUah(), i.getRarity().name(), i.getWeight(), chance, i.getSortOrder(), i.isActive());
    }

    private static String discountLabel(GiftCaseItem i) {
        return i.getDiscountPercent() > 0 ? "Скидка " + i.getDiscountPercent() + " %" : "Скидка " + i.getDiscountUah() + " ₴";
    }

    private static void setDiscount(GiftCaseItem item, Integer percent, Integer uah) {
        int pc = percent == null ? 0 : percent;
        int amount = uah == null ? 0 : uah;
        if (pc < 0 || pc > 50) {
            throw new BadRequestException("Скидка — от 1 до 50 %");
        }
        if (amount < 0 || amount > 100_000) {
            throw new BadRequestException("Скидка — от 1 до 100 000 ₴");
        }
        if (pc == 0 && amount == 0) {
            throw new BadRequestException("Укажите скидку: процент или сумму в ₴");
        }
        item.setDiscountPercent(pc);
        item.setDiscountUah(pc > 0 ? 0 : amount);
    }

    private static GiftCaseItem.Kind kind(String value) {
        if (value == null || value.isBlank()) {
            return GiftCaseItem.Kind.PRODUCT;
        }
        try {
            return GiftCaseItem.Kind.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неизвестный вид приза: " + value);
        }
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

    private static int range(int v, int min, int max, String error) {
        if (v < min || v > max) {
            throw new BadRequestException(error);
        }
        return v;
    }
}
