package com.maxsolch.shop.bundle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.bundle.BundleDtos.AutoTuneDto;
import com.maxsolch.shop.bundle.BundleDtos.AutoTuneRowDto;
import com.maxsolch.shop.bundle.BundleDtos.ForecastDto;
import com.maxsolch.shop.bundle.BundleDtos.ForecastScenarioDto;
import com.maxsolch.shop.bundle.BundleDtos.FunnelDto;
import com.maxsolch.shop.bundle.BundleDtos.FunnelGroupDto;
import com.maxsolch.shop.bundle.BundleDtos.PairStatDto;
import com.maxsolch.shop.bundle.BundleDtos.ProductOfferDto;
import com.maxsolch.shop.bundle.BundleDtos.SlotStatDto;
import com.maxsolch.shop.bundle.BundleDtos.WarningDto;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The numbers of «Вместе дешевле» 2.0 for the admin (docs/BUNDLES.md «Замер», «Автонастройка»):
 * the funnel of the block vs the control group, pairs from the orders, the weekly auto-tune of the
 * discounts, a forecast and warnings.
 */
@Service
public class BundleInsightsService {

    private static final Logger log = LoggerFactory.getLogger(BundleInsightsService.class);

    public static final String EVENT_HOLDOUT = "bundle_holdout";
    static final Duration FUNNEL_WINDOW = Duration.ofDays(30);
    /** Below this many visitors in a group the measured lift is not trusted. */
    static final int MIN_VISITORS = 300;
    /** A missing pair is suggested from this share of the source's orders and this many orders. */
    static final double SUGGEST_RATE = 0.08;
    static final int SUGGEST_MIN_ORDERS = 10;

    private final BundleService bundles;
    private final BundlePairStatsService pairStats;
    private final BundleRuleRepository ruleRepository;
    private final BundleSetupRuleRepository setupRuleRepository;
    private final BundleCategoryMarginRepository marginRepository;
    private final CatalogDirectory directory;
    private final CatalogService catalogService;
    private final SettingsService settings;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public BundleInsightsService(BundleService bundles, BundlePairStatsService pairStats,
                                 BundleRuleRepository ruleRepository, BundleSetupRuleRepository setupRuleRepository,
                                 BundleCategoryMarginRepository marginRepository, CatalogDirectory directory,
                                 CatalogService catalogService, SettingsService settings, AdminAuditService audit,
                                 JdbcTemplate jdbc, ObjectMapper json) {
        this.bundles = bundles;
        this.pairStats = pairStats;
        this.ruleRepository = ruleRepository;
        this.setupRuleRepository = setupRuleRepository;
        this.marginRepository = marginRepository;
        this.directory = directory;
        this.catalogService = catalogService;
        this.settings = settings;
        this.audit = audit;
        this.jdbc = jdbc;
        this.json = json;
    }

    // ---- pairs ----

    /** Pairs of top categories bought together (180 days), with the configured pairs marked. */
    @Transactional(readOnly = true)
    public List<PairStatDto> pairs() {
        pairStats.invalidate();
        BundlePairStats st = pairStats.current();
        CatalogSnapshot snap = directory.snapshot();
        Map<String, BundleRule> rules = new HashMap<>();
        for (BundleRule r : ruleRepository.findAll()) {
            rules.put(UuidUtil.toString(r.getSourceCategoryId()) + ">" + UuidUtil.toString(r.getTargetCategoryId()), r);
        }
        Set<String> setup = new HashSet<>();
        for (BundleSetupRule r : setupRuleRepository.findAll()) {
            setup.add(UuidUtil.toString(r.getSourceCategoryId()) + ">" + UuidUtil.toString(r.getTargetCategoryId()));
        }
        List<PairStatDto> out = new ArrayList<>();
        st.together().forEach((src, targets) -> targets.forEach((tgt, k) -> {
            String key = src + ">" + tgt;
            BundleRule rule = rules.get(key);
            int n = st.anchor(src);
            double rate = st.rate(src, tgt);
            if (k < 3 && rule == null) {
                return;
            }
            boolean suggested = rule == null && !setup.contains(key) && rate >= SUGGEST_RATE && k >= SUGGEST_MIN_ORDERS;
            out.add(new PairStatDto(src, name(snap, src), tgt, name(snap, tgt), n, k, Math.round(rate * 1000) / 1000.0,
                    rule == null ? null : rule.getId(), rule != null && rule.isActive(), setup.contains(key), suggested));
        }));
        out.sort(Comparator.comparingDouble(PairStatDto::rate).reversed());
        return out;
    }

    // ---- funnel ----

    private record Ev(String visitor, String event, Instant at, String productId, JsonNode meta) {
    }

    /**
     * Group B (sees the block) vs H (the control group) over 30 days: visitors who got an offer,
     * who added an offered product (from the block or anywhere else), who then ordered.
     */
    @Transactional(readOnly = true)
    public FunnelDto funnel() {
        Instant since = Instant.now().minus(FUNNEL_WINDOW);
        List<Ev> events = jdbc.query("""
                select coalesce(cast(telegram_user_id as char), anon_id) v, event, created_at, meta,
                       case when product_id is null then null else lower(hex(product_id)) end pid
                  from client_events
                 where created_at >= ? and event in ('bundle_view', 'bundle_holdout', 'bundle_add',
                                                     'add_to_cart', 'order_created')
                   and coalesce(cast(telegram_user_id as char), anon_id) is not null
                 order by created_at
                """, (rs, n) -> new Ev(rs.getString("v"), rs.getString("event"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getString("pid") == null ? null : BundlePairStatsService.uuid(rs.getString("pid")),
                parse(rs.getString("meta"))), Timestamp.from(since));

        record Visitor(String group, Set<String> offered, boolean[] flags) {
        }
        // flags: 0 added offered, 1 ordered after exposure, 2 ordered after adding an offered product
        Map<String, Visitor> visitors = new HashMap<>();
        Map<String, long[]> slots = new TreeMap<>();
        long explores = 0;
        long exploreAdds = 0;
        for (Ev e : events) {
            Visitor v = visitors.get(e.visitor());
            switch (e.event()) {
                case "bundle_view", EVENT_HOLDOUT -> {
                    String g = EVENT_HOLDOUT.equals(e.event()) ? "H" : "B";
                    if (v == null) {
                        v = new Visitor(g, new HashSet<>(), new boolean[3]);
                        visitors.put(e.visitor(), v);
                    }
                    if (e.meta() != null) {
                        for (JsonNode id : e.meta().path("ids")) {
                            v.offered().add(id.asText());
                        }
                        if ("B".equals(g)) {
                            int n = e.meta().path("ids").size();
                            for (int i = 0; i < n; i++) {
                                slots.computeIfAbsent("slot" + (i + 1), k -> new long[2])[0]++;
                            }
                            explores += e.meta().path("ex").asInt(0);
                        }
                    }
                }
                case "bundle_add" -> {
                    if (v != null && e.meta() != null) {
                        for (JsonNode id : e.meta().path("productIds")) {
                            if (v.offered().contains(id.asText())) {
                                v.flags()[0] = true;
                            }
                        }
                        String kind = e.meta().path("kind").asText("");
                        int slot = e.meta().path("slot").asInt(0);
                        String key = slot > 0 ? "slot" + slot : kind.isEmpty() ? "other" : kind;
                        slots.computeIfAbsent(key, k -> new long[2])[1]++;
                        if (!kind.isEmpty() && !key.equals(kind)) {
                            slots.computeIfAbsent(kind, k -> new long[2])[1]++;
                        }
                        if (e.meta().path("ex").asBoolean(false)) {
                            exploreAdds++;
                        }
                    }
                }
                case "add_to_cart" -> {
                    if (v != null && e.productId() != null && v.offered().contains(e.productId())) {
                        v.flags()[0] = true;
                    }
                }
                case "order_created" -> {
                    if (v != null) {
                        v.flags()[1] = true;
                        if (v.flags()[0]) {
                            v.flags()[2] = true;
                        }
                    }
                }
                default -> {
                }
            }
        }
        List<FunnelGroupDto> groups = new ArrayList<>();
        for (String g : List.of("B", "H")) {
            long n = 0;
            long added = 0;
            long ordered = 0;
            long addonOrders = 0;
            for (Visitor v : visitors.values()) {
                if (!g.equals(v.group())) {
                    continue;
                }
                n++;
                added += v.flags()[0] ? 1 : 0;
                ordered += v.flags()[1] ? 1 : 0;
                addonOrders += v.flags()[2] ? 1 : 0;
            }
            groups.add(new FunnelGroupDto(g, n, n, added, ordered, addonOrders, ordered));
        }
        FunnelGroupDto b = groups.get(0);
        FunnelGroupDto h = groups.get(1);
        Double lift = null;
        if (b.visitors() >= MIN_VISITORS && h.visitors() >= MIN_VISITORS && h.addonOrders() > 0) {
            double rb = (double) b.addonOrders() / b.visitors();
            double rh = (double) h.addonOrders() / h.visitors();
            lift = Math.round((rb / rh - 1) * 1000) / 10.0;
        }
        List<SlotStatDto> bySlot = new ArrayList<>();
        slots.forEach((k, v) -> bySlot.add(new SlotStatDto(k, v[0], v[1])));
        return new FunnelDto(since, groups, lift, MIN_VISITORS, bySlot, explores, exploreAdds);
    }

    // ---- auto-tune ----

    /** Every Monday night, when the auto-tune is on. */
    @Scheduled(cron = "0 20 5 * * MON")
    public void scheduledAutoTune() {
        try {
            if (settings.getBool(SettingsRegistry.BUNDLE_AUTO_TUNE)) {
                AutoTuneDto r = autoTune();
                log.info("Bundle auto-tune: {} categories, lift {} ({})", r.rows().size(), r.liftUsed(), r.liftSource());
            }
        } catch (RuntimeException e) {
            log.warn("Bundle auto-tune failed: {}", e.getMessage());
        }
    }

    /**
     * d* = m/2 − (1+r)/(2e) for each category with a margin of its own (or its parent's), clamped to
     * 0..m−safety: r — the lift of the block without a discount (measured on the control group once
     * there is enough data, else the setting), e — the response per percentage point.
     */
    @Transactional
    public AutoTuneDto autoTune() {
        double[] lift = lift();
        double e = Math.max(0.001, settings.getInt(SettingsRegistry.BUNDLE_RESPONSE_PERCENT) / 100.0);
        BundleMargins margins = bundles.margins();
        CatalogSnapshot snap = directory.snapshot();
        Map<String, BundleCategoryMargin> rows = new HashMap<>();
        for (BundleCategoryMargin m : marginRepository.findAll()) {
            rows.put(UuidUtil.toString(m.getCategoryId()), m);
        }
        Instant now = Instant.now();
        List<AutoTuneRowDto> out = new ArrayList<>();
        for (CatalogSnapshot.Cat c : snap.treeOrder()) {
            BundleCategoryMargin own = rows.get(c.id());
            boolean hasMargin = (own != null && own.getMarginPercent() != null)
                    || (c.parentId() != null && rows.get(c.parentId()) != null
                    && rows.get(c.parentId()).getMarginPercent() != null);
            if (!hasMargin) {
                continue;
            }
            int m = margins.margin(c.id());
            int max = margins.maxPercent(c.id());
            int d = (int) Math.round(optimal(m, lift[0], e));
            d = Math.max(0, Math.min(max, d));
            int old = margins.cap(c.id());
            if (own == null) {
                own = new BundleCategoryMargin();
                own.setCategoryId(UuidUtil.toBytes(c.id()));
            }
            own.setAutoPercent(d);
            own.setAutoUpdatedAt(now);
            marginRepository.save(own);
            out.add(new AutoTuneRowDto(c.id(), name(snap, c.id()), m, old, d, margins.manual(c.id())));
        }
        String source = lift[1] > 0 ? "MEASURED" : "SETTING";
        audit.record("BUNDLE_AUTOTUNE", "BUNDLE", "-", out.size() + " категорий, r=" + lift[0] + " (" + source + ")");
        return new AutoTuneDto(now, lift[0], source, e, out);
    }

    /** Profit-maximising discount: q(d) = q0(1 + r + e·d), profit = q(d)(m − d). */
    static double optimal(double marginPercent, double lift, double responsePerPoint) {
        return marginPercent / 2.0 - (1 + lift) / (2 * responsePerPoint);
    }

    /** {lift, 1 = measured / 0 = setting}. */
    private double[] lift() {
        try {
            Double measured = funnel().liftPercent();
            if (measured != null) {
                return new double[]{Math.max(0, Math.min(1, measured / 100.0)), 1};
            }
        } catch (RuntimeException ignored) {
            // No events table data — fall back to the setting.
        }
        return new double[]{settings.getInt(SettingsRegistry.BUNDLE_LIFT_PERCENT) / 100.0, 0};
    }

    // ---- forecast ----

    private record OrderLines(String orderId, boolean promo, long bundleDiscount, List<BundlePricing.Line> lines) {
    }

    /**
     * A month ahead in three scenarios (the response halved, as set, doubled): accessory orders,
     * their revenue, the discount and the extra profit vs no block. The base attach rate and the
     * average accessory come from the orders of the last 180 days.
     */
    @Transactional(readOnly = true)
    public ForecastDto forecast() {
        List<OrderLines> orders = orderLines(BundlePairStatsService.WINDOW);
        var path = bundles.pathFunction();
        List<BundlePricing.Rule> rules = bundles.rules();
        BundleMargins margins = bundles.margins();
        BundlePricing.Config probe = new BundlePricing.Config(true, List.of(100, 100, 100),
                settings.getInt(SettingsRegistry.BUNDLE_MAX_ADDON_PRICE_PERCENT), 0);
        long withAddon = 0;
        long addonSum = 0;
        long addonCount = 0;
        long capWeighted = 0;
        long marginWeighted = 0;
        for (OrderLines o : orders) {
            BundlePricing.Result r = BundlePricing.compute(o.lines(), rules, path, probe);
            if (r.addonUnits() == 0) {
                continue;
            }
            withAddon++;
            for (BundlePricing.Line l : o.lines()) {
                if (r.lines().containsKey(l.key())) {
                    addonSum += l.unitPriceMinor();
                    addonCount++;
                    capWeighted += (long) margins.cap(l.categoryId()) * l.unitPriceMinor();
                    marginWeighted += (long) margins.margin(l.categoryId()) * l.unitPriceMinor();
                }
            }
        }
        long perMonth = Math.round(orders.size() / 6.0);
        double base = orders.isEmpty() ? 0 : (double) withAddon / orders.size();
        long avgAddon = addonCount == 0 ? 0 : addonSum / addonCount;
        int avgPct = addonSum == 0 ? 0 : (int) Math.round((double) capWeighted / addonSum);
        int avgMargin = addonSum == 0 ? margins.defaultMargin() : (int) Math.round((double) marginWeighted / addonSum);
        double r = lift()[0];
        double e = settings.getInt(SettingsRegistry.BUNDLE_RESPONSE_PERCENT) / 100.0;

        List<ForecastScenarioDto> scenarios = new ArrayList<>();
        String[][] defs = {{"LOW", "Осторожно", "0.5"}, {"BASE", "Как в настройках", "1"}, {"HIGH", "Оптимистично", "2"}};
        for (String[] d : defs) {
            double resp = e * Double.parseDouble(d[2]);
            double rr = r * Double.parseDouble(d[2]);
            double baseOrders = perMonth * base;
            double addonOrders = baseOrders * (1 + rr + resp * avgPct);
            long revenue = Math.round(addonOrders * avgAddon);
            long discount = Math.round(addonOrders * avgAddon * avgPct / 100.0);
            long profit = Math.round(addonOrders * avgAddon * (avgMargin - avgPct) / 100.0
                    - baseOrders * avgAddon * avgMargin / 100.0);
            scenarios.add(new ForecastScenarioDto(d[0], d[1], resp, Math.round(addonOrders),
                    Math.round(addonOrders - baseOrders), revenue, discount, profit));
        }
        return new ForecastDto(perMonth, Math.round(base * 1000) / 1000.0, avgAddon, avgPct, avgMargin, scenarios);
    }

    // ---- warnings ----

    @Transactional(readOnly = true)
    public List<WarningDto> warnings() {
        List<WarningDto> out = new ArrayList<>();
        CatalogSnapshot snap = directory.snapshot();
        var path = bundles.pathFunction();
        List<BundlePricing.Rule> rules = bundles.rules();
        BundleMargins margins = bundles.margins();
        boolean enabled = settings.getBool(SettingsRegistry.BUNDLE_ENABLED);
        if (!enabled) {
            out.add(new WarningDto("WARN", "DISABLED", "«Вместе дешевле» выключено — покупатели блок не видят.",
                    null, null));
        }

        // Targets whose cap is 0: offered, but without a discount.
        Set<String> targets = new HashSet<>();
        rules.forEach(r -> targets.add(r.targetCategoryId()));
        for (String t : targets) {
            if (margins.cap(t) <= 0) {
                out.add(new WarningDto("WARN", "CAP_ZERO", "«" + name(snap, t) + "»: скидка 0 % — маржа "
                        + margins.margin(t) + " % не больше страховки. Аксессуары показываются без скидки.",
                        null, t));
            }
        }

        // Hits of accessory categories that ran out.
        List<ProductDto> all = catalogService.listActiveProducts("ru");
        Map<String, Double> avg = BundleRanker.averageSold(all, path);
        for (ProductDto p : all) {
            List<String> pp = path.apply(p.categoryId());
            boolean accessory = pp.stream().anyMatch(targets::contains);
            String top = BundleRanker.top(p.categoryId(), path);
            if (accessory && p.effectiveStock() <= 0 && p.soldCount() >= 5
                    && p.soldCount() >= 2 * avg.getOrDefault(top, 0.0)) {
                out.add(new WarningDto("WARN", "HIT_OUT", "Хит «" + p.title() + "» закончился — его не предлагают.",
                        p.id(), p.categoryId()));
            }
        }

        // Products that would show an empty block.
        Map<String, int[]> empty = new LinkedHashMap<>();
        Set<String> sources = new HashSet<>();
        rules.forEach(r -> sources.add(r.sourceCategoryId()));
        for (ProductDto p : all) {
            if (p.effectiveStock() <= 0 || path.apply(p.categoryId()).stream().noneMatch(sources::contains)) {
                continue;
            }
            String top = BundleRanker.top(p.categoryId(), path);
            int[] c = empty.computeIfAbsent(top, k -> new int[2]);
            c[1]++;
            ProductOfferDto offer = bundles.offer(p.id(), "ru", false, 0, true);
            if (offer.slots().isEmpty()) {
                c[0]++;
            }
        }
        empty.forEach((top, c) -> {
            if (c[0] > 0) {
                out.add(new WarningDto(c[0] * 4 >= c[1] ? "WARN" : "INFO", "NO_CANDIDATES",
                        "«" + name(snap, top) + "»: у " + c[0] + " из " + c[1]
                                + " товаров в наличии нечего предложить (нет подходящих аксессуаров в наличии и по цене).",
                        null, top));
            }
        });

        // Orders where the promo code beat the bundle (30 days).
        long promoWon = 0;
        BundlePricing.Config cfg = bundles.config(margins);
        for (OrderLines o : orderLines(Duration.ofDays(30))) {
            if (o.promo() && o.bundleDiscount() == 0
                    && BundlePricing.compute(o.lines(), rules, path, cfg).discountMinor() > 0) {
                promoWon++;
            }
        }
        if (promoWon > 0) {
            out.add(new WarningDto("INFO", "PROMO_WON", promoWon + " заказ(ов) за 30 дней получили промокод вместо "
                    + "комплекта — промокод был выгоднее.", null, null));
        }
        if (setupRuleRepository.count() == 0 && settings.getBool(SettingsRegistry.BUNDLE_SETUP_ENABLED)) {
            out.add(new WarningDto("INFO", "SETUP_EMPTY", "«Собери сетап» включено, но пар нет.", null, null));
        }
        return out;
    }

    // ---- helpers ----

    private List<OrderLines> orderLines(Duration window) {
        Map<String, OrderLines> byOrder = new LinkedHashMap<>();
        jdbc.query("""
                select lower(hex(o.id)) oid, o.promo_code is not null promo, o.bundle_discount_minor bd,
                       lower(hex(oi.product_id)) pid, lower(hex(oi.variant_id)) vid,
                       lower(hex(p.category_id)) cid, oi.price_minor_snapshot price, oi.quantity qty
                  from orders o
                  join order_items oi on oi.order_id = o.id
                  join products p on p.id = oi.product_id
                 where o.created_at >= ? and o.status <> 'REJECTED' and oi.gift = false
                 order by o.created_at
                """, rs -> {
            String oid = rs.getString("oid");
            OrderLines o = byOrder.computeIfAbsent(oid, k -> {
                try {
                    return new OrderLines(k, rs.getBoolean("promo"), rs.getLong("bd"), new ArrayList<>());
                } catch (java.sql.SQLException ex) {
                    throw new IllegalStateException(ex);
                }
            });
            String cid = rs.getString("cid");
            String key = rs.getString("pid") + "::" + (rs.getString("vid") == null ? "" : rs.getString("vid"));
            o.lines().add(new BundlePricing.Line(key, cid == null ? null : BundlePairStatsService.uuid(cid),
                    rs.getLong("price"), rs.getInt("qty")));
        }, Timestamp.from(Instant.now().minus(window)));
        return new ArrayList<>(byOrder.values());
    }

    private JsonNode parse(String meta) {
        if (meta == null || meta.isBlank()) {
            return null;
        }
        try {
            return json.readTree(meta);
        } catch (Exception e) {
            return null;
        }
    }

    static String name(CatalogSnapshot snap, String id) {
        CatalogSnapshot.Cat c = id == null ? null : snap.category(id);
        if (c == null) {
            return "?";
        }
        CatalogSnapshot.Cat parent = c.parentId() == null ? null : snap.category(c.parentId());
        return parent == null ? c.name() : parent.name() + " › " + c.name();
    }
}
