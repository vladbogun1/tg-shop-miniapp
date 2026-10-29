package com.maxsolch.shop.finance.app;

import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.procurement.app.CostingService;
import com.maxsolch.shop.procurement.domain.BatchCost;
import com.maxsolch.shop.analytics.metrics.MetricsFacts;
import com.maxsolch.shop.analytics.metrics.MetricsFactsLoader;
import com.maxsolch.shop.analytics.metrics.MetricsPeriod;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesDto;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchSalesLineDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginReportDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MarginRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderLineCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.OrderProfitDto;
import com.maxsolch.shop.procurement.app.CostingService.CostBook;
import com.maxsolch.shop.procurement.app.CostingService.UnitCost;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.LineProducts;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.platform.error.NotFoundException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Margin (§5А.3): profit of an order, the P&L of a batch and «Метрики → Маржа». Revenue is what the order
 * keeps (total − refunds − not collected), split over its lines by price; cost of goods comes from the lots
 * each unit left (FIFO), priced now — an expense typed after the sale re-prices it. The acquiring fee is the
 * bank's own ({@code payment_invoices.fee_minor}), {@code costing.acquiringFeePercent} (1,3 %) when monobank
 * sent none.
 */
@Service
public class MarginService {

    /** monobank acquiring, as measured on prod 27.10.2026 (1,3 % for every method): the setting's default. */
    static final BigDecimal DEFAULT_FEE_PERCENT = new BigDecimal("1.3");

    private final NamedParameterJdbcTemplate jdbc;
    private final CostingService costing;
    private final LotLedger ledger;
    private final BatchCatalog batches;
    private final LineProducts queue;
    private final MetricsFactsLoader facts;
    private final SettingsService settings;

    public MarginService(NamedParameterJdbcTemplate jdbc, CostingService costing, LotLedger ledger,
                         BatchCatalog batches, LineProducts queue, MetricsFactsLoader facts,
                         SettingsService settings) {
        this.settings = settings;
        this.jdbc = jdbc;
        this.costing = costing;
        this.ledger = ledger;
        this.batches = batches;
        this.queue = queue;
        this.facts = facts;
    }

    // ---------------------------------------------------------------- raw rows

    record OrderRow(String id, long totalMinor, long refundedMinor, long uncollectedMinor, String status,
                    boolean online, long prepaymentMinor) {
        OrderRow(String id, long totalMinor, long refundedMinor, long uncollectedMinor, String status) {
            this(id, totalMinor, refundedMinor, uncollectedMinor, status, false, 0);
        }

        /** What the bank is to take the fee from: the prepayment, or the whole order when paid in full online. */
        long onlineDueMinor() {
            return !online ? 0 : com.maxsolch.shop.order.domain.OrderMoney.dueOnlineMinor(totalMinor, prepaymentMinor);
        }

        long revenue() {
            return Math.max(0, totalMinor - Math.max(0, refundedMinor) - Math.max(0, uncollectedMinor));
        }
    }

    record ItemRow(long id, String orderId, String productId, String variantId, String title, String variantName,
                   long priceMinor, int qty, int returnedQty, int restockedQty, boolean gift) {
        int soldUnits() {
            return Math.max(0, qty - Math.max(0, returnedQty));
        }

        /** Units that left the shelf and did not come back (returned-and-written-off ones included). */
        int unitsOut() {
            return Math.max(0, qty - Math.max(0, restockedQty));
        }
    }

    record Alloc(long itemId, long lotId, int qty, Instant at) {
    }

    record Invoice(String orderId, long amountMinor, long feeMinor) {
    }

    /** One order with everything needed for its profit. */
    record Bundle(OrderRow order, List<ItemRow> items, Map<Long, List<Alloc>> allocs, List<Invoice> invoices) {
    }

    /** Per-line result inside an order. */
    record LineMoney(ItemRow item, long revenue, long cost, int unknownUnits, boolean preliminary,
                     List<Alloc> allocs) {
    }

    record OrderMoney(OrderRow order, List<LineMoney> lines, long revenue, long cost, long fee,
                      boolean feeEstimated, boolean complete, boolean preliminary) {
        long profit() {
            return revenue - cost - fee;
        }
    }

    private Map<String, Bundle> load(Collection<String> orderIds) {
        Map<String, Bundle> out = new LinkedHashMap<>();
        if (orderIds.isEmpty()) {
            return out;
        }
        MapSqlParameterSource p = new MapSqlParameterSource("ids",
                orderIds.stream().map(UuidUtil::toBytes).toList());
        List<OrderRow> orders = jdbc.query("select bin_to_uuid(id) id, total_minor, refunded_minor, "
                + "uncollected_minor, status, payment_due_at is not null online, prepayment_minor "
                + "from orders where id in (:ids)", p, (rs, i) -> new OrderRow(
                rs.getString("id"), rs.getLong("total_minor"), rs.getLong("refunded_minor"),
                rs.getLong("uncollected_minor"), rs.getString("status"), rs.getBoolean("online"),
                rs.getLong("prepayment_minor")));
        List<ItemRow> items = jdbc.query("select id, bin_to_uuid(order_id) order_id, bin_to_uuid(product_id) pid, "
                + "bin_to_uuid(variant_id) vid, title_snapshot, variant_name_snapshot, price_minor_snapshot, quantity, "
                + "returned_qty, restocked_qty, gift from order_items where order_id in (:ids) order by id", p,
                MarginService::item);
        Map<Long, List<Alloc>> allocs = new HashMap<>();
        jdbc.query("select l.order_item_id, l.lot_id, l.qty, l.created_at from order_item_lots l "
                + "join order_items oi on oi.id = l.order_item_id where oi.order_id in (:ids) order by l.id", p,
                rs -> {
                    allocs.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
                            .add(new Alloc(rs.getLong(1), rs.getLong(2), rs.getInt(3), ts(rs, 4)));
                });
        List<Invoice> invoices = jdbc.query("select bin_to_uuid(order_id) oid, amount_minor, fee_minor "
                + "from payment_invoices where order_id in (:ids) and applied_at is not null", p,
                (rs, i) -> new Invoice(rs.getString(1), rs.getLong(2), rs.getLong(3)));
        Map<String, List<ItemRow>> itemsBy = items.stream().collect(Collectors.groupingBy(ItemRow::orderId));
        Map<String, List<Invoice>> invBy = invoices.stream().collect(Collectors.groupingBy(Invoice::orderId));
        for (OrderRow o : orders) {
            List<ItemRow> its = itemsBy.getOrDefault(o.id(), List.of());
            Map<Long, List<Alloc>> a = new HashMap<>();
            its.forEach(i -> a.put(i.id(), allocs.getOrDefault(i.id(), List.of())));
            out.put(o.id(), new Bundle(o, its, a, invBy.getOrDefault(o.id(), List.of())));
        }
        return out;
    }

    private static ItemRow item(ResultSet rs, int i) throws SQLException {
        return new ItemRow(rs.getLong("id"), rs.getString("order_id"), rs.getString("pid"), rs.getString("vid"),
                rs.getString("title_snapshot"), rs.getString("variant_name_snapshot"),
                rs.getLong("price_minor_snapshot"), rs.getInt("quantity"), rs.getInt("returned_qty"),
                rs.getInt("restocked_qty"), rs.getBoolean("gift"));
    }

    private static Instant ts(ResultSet rs, int col) throws SQLException {
        Timestamp t = rs.getTimestamp(col);
        return t == null ? null : t.toInstant();
    }

    private CostBook bookFor(Collection<Bundle> bundles, Collection<StockLot> extra) {
        Set<Long> ids = new HashSet<>();
        bundles.forEach(b -> b.allocs().values().forEach(l -> l.forEach(a -> ids.add(a.lotId()))));
        List<StockLot> all = new ArrayList<>(ledger.lotsByIds(ids));
        all.addAll(extra);
        return costing.book(all);
    }

    // ---------------------------------------------------------------- the math

    static OrderMoney compute(Bundle b, Function<Long, UnitCost> costOfLot) {
        return compute(b, costOfLot, DEFAULT_FEE_PERCENT);
    }

    /** {@code feePercent}: the bank's cut where monobank sent no fee of its own. */
    static OrderMoney compute(Bundle b, Function<Long, UnitCost> costOfLot, BigDecimal feePercent) {
        long revenue = b.order().revenue();
        long base = b.items().stream().filter(i -> !i.gift()).mapToLong(i -> i.priceMinor() * i.soldUnits()).sum();
        List<ItemRow> paid = b.items().stream().filter(i -> !i.gift() && i.priceMinor() * i.soldUnits() > 0).toList();
        Map<Long, Long> share = new HashMap<>();
        if (base > 0) {
            Map<Long, Long> w = new HashMap<>();
            paid.forEach(i -> w.put(i.id(), i.priceMinor() * i.soldUnits()));
            share.putAll(BatchCost.split(revenue, w));
        }
        List<LineMoney> lines = new ArrayList<>();
        long cost = 0;
        boolean complete = true;
        boolean preliminary = false;
        for (ItemRow i : b.items()) {
            List<Alloc> al = b.allocs().getOrDefault(i.id(), List.of());
            long c = 0;
            int unknown = 0;
            int allocated = 0;
            boolean pre = false;
            for (Alloc a : al) {
                UnitCost u = costOfLot.apply(a.lotId());
                allocated += a.qty();
                if (u.minor() == null) {
                    unknown += a.qty();
                } else {
                    c += u.minor() * a.qty();
                    pre |= u.preliminary();
                }
            }
            unknown += Math.max(0, i.unitsOut() - allocated);
            lines.add(new LineMoney(i, share.getOrDefault(i.id(), 0L), c, unknown, pre, al));
            cost += c;
            complete &= unknown == 0;
            preliminary |= pre;
        }
        long fee = 0;
        boolean estimated = false;
        for (Invoice inv : b.invoices()) {
            if (inv.feeMinor() > 0) {
                fee += inv.feeMinor();
            } else if (inv.amountMinor() > 0) {
                fee += fee(inv.amountMinor(), feePercent);
                estimated = true;
            }
        }
        if (b.invoices().isEmpty() && b.order().onlineDueMinor() > 0) {
            // not paid yet: the fee monobank will take once it is
            fee = fee(b.order().onlineDueMinor(), feePercent);
            estimated = true;
        }
        return new OrderMoney(b.order(), lines, revenue, cost, fee, estimated, complete, preliminary);
    }

    static long fee(long amountMinor, BigDecimal feePercent) {
        return BigDecimal.valueOf(amountMinor).multiply(feePercent).movePointLeft(2)
                .setScale(0, java.math.RoundingMode.HALF_UP).longValue();
    }

    private BigDecimal feePercent() {
        return settings.getDecimal(SettingsRegistry.COSTING_ACQUIRING_FEE_PERCENT);
    }

    // ---------------------------------------------------------------- order

    @Transactional(readOnly = true)
    public OrderProfitDto order(String orderId) {
        Bundle b = load(List.of(orderId)).get(orderId);
        if (b == null) {
            throw new NotFoundException("Заказ не найден");
        }
        CostBook book = bookFor(List.of(b), List.of());
        Map<Long, StockLot> byId = lotsById(List.of(b));
        OrderMoney m = compute(b, id -> book.of(byId.get(id)), feePercent());
        List<OrderLineCostDto> lines = m.lines().stream().map(l -> new OrderLineCostDto(l.item().id(),
                l.item().title(), l.item().variantName(), l.item().gift(), l.item().unitsOut(), l.revenue(),
                l.cost(), l.unknownUnits(), l.preliminary())).toList();
        return new OrderProfitDto(orderId, m.revenue(), m.cost(), m.fee(), m.feeEstimated(), m.profit(),
                m.revenue() > 0 ? CostingService.pct(m.profit(), m.revenue()) : null, m.complete(),
                m.preliminary(), lines);
    }

    private Map<Long, StockLot> lotsById(Collection<Bundle> bundles) {
        Set<Long> ids = new HashSet<>();
        bundles.forEach(b -> b.allocs().values().forEach(l -> l.forEach(a -> ids.add(a.lotId()))));
        return ledger.lotsByIds(ids).stream().collect(Collectors.toMap(StockLot::getId, Function.identity()));
    }

    // ---------------------------------------------------------------- report

    @Transactional(readOnly = true)
    public MarginReportDto report(MetricsPeriod period) {
        MetricsFacts f = facts.load();
        List<String> ids = f.orders().stream()
                .filter(o -> o.sold() && period.contains(o.createdAt()))
                .map(MetricsFacts.OrderFact::id)
                .toList();
        Map<String, Bundle> bundles = load(ids);
        List<StockLot> shelf = ledger.lotsOnShelf();
        Map<Long, StockLot> lotById = new HashMap<>(lotsById(bundles.values()));
        shelf.forEach(l -> lotById.put(l.getId(), l));
        CostBook book = bookFor(bundles.values(), shelf);

        Map<String, String[]> catalog = catalog();
        Agg byProduct = new Agg();
        Agg byBrand = new Agg();
        Agg byCategory = new Agg();
        Agg byBatch = new Agg();
        long revenue = 0;
        long known = 0;
        long cost = 0;
        long fee = 0;
        long gifts = 0;
        for (Bundle b : bundles.values()) {
            OrderMoney m = compute(b, id -> book.of(lotById.get(id)), feePercent());
            revenue += m.revenue();
            if (m.complete()) {
                known += m.revenue();
                cost += m.cost();
                fee += m.fee();
                gifts += m.lines().stream().filter(l -> l.item().gift()).mapToLong(LineMoney::cost).sum();
            }
            for (LineMoney l : m.lines()) {
                ItemRow i = l.item();
                String[] cat = catalog.getOrDefault(i.productId(), new String[] {"—", "—"});
                boolean ok = l.unknownUnits() == 0;
                int units = i.gift() ? 0 : i.soldUnits();
                byProduct.add(i.productId(), i.title(), units, l.revenue(), l.cost(), ok);
                byBrand.add(cat[0], cat[0], units, l.revenue(), l.cost(), ok);
                byCategory.add(cat[1], cat[1], units, l.revenue(), l.cost(), ok);
                int out = Math.max(1, i.unitsOut());
                for (Alloc a : l.allocs()) {
                    StockLot lot = lotById.get(a.lotId());
                    PreorderBatch pb = book.batchOf(lot);
                    UnitCost u = book.of(lot);
                    String key = pb == null ? "opening" : "b" + pb.getId();
                    String label = pb == null ? "Старый остаток" : pb.getTitle();
                    long rev = l.revenue() * a.qty() / out;
                    byBatch.add(key, label, i.gift() ? 0 : a.qty(), rev, u.minor() == null ? 0 : u.minor() * a.qty(),
                            u.minor() != null);
                }
            }
        }
        long stockValue = 0;
        int stockUnits = 0;
        int stockUnknown = 0;
        for (StockLot l : shelf) {
            UnitCost u = book.of(l);
            stockUnits += l.getQtyLeft();
            if (u.minor() == null) {
                stockUnknown += l.getQtyLeft();
            } else {
                stockValue += u.minor() * l.getQtyLeft();
            }
        }
        long profit = known - cost - fee;
        return new MarginReportDto(period.from(), period.to(), revenue, known,
                revenue > 0 ? Math.round(known * 1000.0 / revenue) / 1000.0 : null, cost, fee, gifts, profit,
                known > 0 ? CostingService.pct(profit, known) : null, stockValue, stockUnits, stockUnknown,
                byProduct.rows(50), byBrand.rows(30), byCategory.rows(30), byBatch.rows(30));
    }

    /** productId → {brand, category}. */
    private Map<String, String[]> catalog() {
        Map<String, String[]> m = new HashMap<>();
        jdbc.query("select bin_to_uuid(p.id), b.name, c.name from products p left join brands b on b.id = p.brand_id "
                + "left join categories c on c.id = p.category_id", rs -> {
                    m.put(rs.getString(1), new String[] {
                            rs.getString(2) == null ? "Без бренда" : rs.getString(2),
                            rs.getString(3) == null ? "Без категории" : rs.getString(3)});
                });
        return m;
    }

    /** Sums by a key; a line with unknown cost goes to {@code unknownRevenue}, not into the margin. */
    static final class Agg {
        private final Map<String, long[]> sums = new LinkedHashMap<>();
        private final Map<String, String> labels = new HashMap<>();

        void add(String key, String label, int units, long revenue, long cost, boolean known) {
            long[] s = sums.computeIfAbsent(key, k -> new long[4]);
            labels.putIfAbsent(key, label);
            s[0] += units;
            if (known) {
                s[1] += revenue;
                s[2] += cost;
            } else {
                s[3] += revenue;
            }
        }

        List<MarginRowDto> rows(int limit) {
            return sums.entrySet().stream()
                    .map(e -> {
                        long[] s = e.getValue();
                        long profit = s[1] - s[2];
                        return new MarginRowDto(e.getKey(), labels.get(e.getKey()), (int) s[0], s[1], s[2], profit,
                                s[1] > 0 ? CostingService.pct(profit, s[1]) : null, s[3]);
                    })
                    .sorted(Comparator.comparingLong((MarginRowDto r) -> r.revenueMinor() + r.unknownRevenueMinor())
                            .reversed())
                    .limit(limit)
                    .toList();
        }
    }

    // ---------------------------------------------------------------- batch P&L

    @Transactional(readOnly = true)
    public BatchSalesDto batch(long batchId) {
        PreorderBatch pb = batches.find(batchId).orElseThrow(() -> new NotFoundException("Поставка не найдена"));
        List<PreorderBatchItem> lines = batches.linesOf(batchId);
        List<StockLot> batchLots = ledger.lotsOfBatchItems(lines.stream().map(PreorderBatchItem::getId).toList());
        CostBook book = costing.book(batchLots);
        Map<Long, StockLot> lotById = batchLots.stream().collect(Collectors.toMap(StockLot::getId, Function.identity()));

        Map<String, Bundle> bundles = Map.of();
        if (!lotById.isEmpty()) {
            List<String> orderIds = jdbc.queryForList("select distinct bin_to_uuid(oi.order_id) from order_item_lots l "
                    + "join order_items oi on oi.id = l.order_item_id join orders o on o.id = oi.order_id "
                    + "where l.lot_id in (:lots) and o.status <> 'REJECTED'",
                    new MapSqlParameterSource("lots", lotById.keySet()), String.class);
            bundles = load(orderIds);
        }
        Set<String> soldIds = bundles.isEmpty() ? Set.of() : facts.load().orders().stream()
                .filter(MetricsFacts.OrderFact::sold).map(MetricsFacts.OrderFact::id).collect(Collectors.toSet());
        Map<Long, StockLot> allLots = new HashMap<>(lotsById(bundles.values()));
        CostBook full = bookFor(bundles.values(), batchLots);

        Map<Long, long[]> perLine = new HashMap<>(); // itemId → {sold, revenue, cost, reserved}
        Instant last = null;
        for (Bundle b : bundles.values()) {
            if (!soldIds.contains(b.order().id())) {
                // awaiting online payment: off the shelf, but not a sale yet
                b.allocs().values().forEach(al -> al.forEach(a -> {
                    StockLot lot = lotById.get(a.lotId());
                    if (lot != null) {
                        perLine.computeIfAbsent(lot.getBatchItemId(), k -> new long[4])[3] += a.qty();
                    }
                }));
                continue;
            }
            OrderMoney m = compute(b, id -> full.of(allLots.get(id)), feePercent());
            for (LineMoney l : m.lines()) {
                int out = Math.max(1, l.item().unitsOut());
                for (Alloc a : l.allocs()) {
                    StockLot lot = lotById.get(a.lotId());
                    if (lot == null) {
                        continue;
                    }
                    UnitCost u = book.of(lot);
                    long[] s = perLine.computeIfAbsent(lot.getBatchItemId(), k -> new long[4]);
                    s[0] += a.qty();
                    s[1] += l.revenue() * a.qty() / out;
                    s[2] += u.minor() == null ? 0 : u.minor() * a.qty();
                    if (a.at() != null && (last == null || a.at().isAfter(last))) {
                        last = a.at();
                    }
                }
            }
        }
        Map<String, Product> products = queue.productsOf(lines.stream().map(PreorderBatchItem::getProductId).toList());
        List<BatchSalesLineDto> out = new ArrayList<>();
        long spent = 0;
        long revenue = 0;
        long costSold = 0;
        long leftValue = 0;
        int arrived = 0;
        int sold = 0;
        int left = 0;
        int reserved = 0;
        boolean preliminary = false;
        for (PreorderBatchItem i : lines) {
            Product p = products.get(UuidUtil.toString(i.getProductId()));
            ProductVariant v = p == null ? null : Lines.variantById(p, i.getVariantId());
            int in = i.getQtyArrived() == null ? 0 : i.getQtyArrived();
            int l = batchLots.stream().filter(x -> x.getBatchItemId().equals(i.getId()))
                    .mapToInt(StockLot::getQtyLeft).sum();
            UnitCost u = batchLots.stream().filter(x -> x.getBatchItemId().equals(i.getId())).findFirst()
                    .map(book::of).orElse(new UnitCost(null, false));
            long[] s = perLine.getOrDefault(i.getId(), new long[4]);
            long unit = u.minor() == null ? 0 : u.minor();
            spent += unit * in;
            revenue += s[1];
            costSold += s[2];
            leftValue += unit * l;
            arrived += in;
            sold += (int) s[0];
            left += l;
            reserved += (int) s[3];
            preliminary |= u.preliminary() || (u.minor() == null && in > 0);
            out.add(new BatchSalesLineDto(i.getId(), p == null ? "(товар удалён)" : p.getTitle(),
                    v == null ? null : v.getName(), in, (int) s[0], (int) s[3], l, u.minor(), s[1], s[2],
                    s[1] - s[2]));
        }
        Instant soldOut = arrived > 0 && left == 0 && reserved == 0 ? last : null;
        Integer days = soldOut != null && pb.getArrivedAt() != null
                ? (int) Math.max(0, Duration.between(pb.getArrivedAt(), soldOut).toDays()) : null;
        long profit = revenue - costSold;
        return new BatchSalesDto(batchId, spent, revenue, costSold, profit,
                revenue > 0 ? CostingService.pct(profit, revenue) : null, arrived, sold, reserved, left, leftValue,
                pb.getArrivedAt(), soldOut, days, preliminary, out);
    }
}
