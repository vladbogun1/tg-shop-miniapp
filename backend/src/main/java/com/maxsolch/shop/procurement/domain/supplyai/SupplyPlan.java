package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Review result to what must be created: new products (hidden drafts; the same title is one product with
 * variants), supply positions (the same product + variant add up) and pairs for supplier memory. Same logic and
 * message texts as frontend-admin/features/supply/model/ai/plan.ts. The draft sale price is not stored in the plan:
 * it is passed to {@link #problems} by product key.
 */
public final class SupplyPlan {

    /** A new product to create; variants empty means a product without variants. */
    public record NewProduct(String key, String title, String brand, String categoryId,
                             List<String> variants, List<String> lineIds) {
    }

    /** Created product: id and variants by name. */
    public record Created(String productId, List<CatalogItem.Variant> variants) {
    }

    /** A line with its product, found or just created. */
    public record Resolved(SourceLine line, String productId, String variantId) {
    }

    /** A supply position. */
    public record MergedLine(String productId, String variantId, int qty, Double unitPrice) {
    }

    private SupplyPlan() {
    }

    public static String draftKey(NewProductDraft d) {
        return SupplyText.trim(d.title()).toLowerCase(Locale.ROOT);
    }

    /** New products from "new" decisions; lines with the same title merge. */
    public static List<NewProduct> newProducts(List<ReviewRow> rows) {
        Map<String, NewProduct> out = new LinkedHashMap<>();
        for (ReviewRow r : rows) {
            if (!"new".equals(r.decision().kind())) {
                continue;
            }
            NewProductDraft d = r.decision().draft();
            String key = draftKey(d);
            NewProduct plan = out.computeIfAbsent(key, k -> new NewProduct(k, SupplyText.trim(d.title()), d.brand(),
                    d.categoryId(), new ArrayList<>(), new ArrayList<>()));
            if (d.variant() != null && !d.variant().isEmpty() && !plan.variants().contains(d.variant())) {
                plan.variants().add(d.variant());
            }
            plan.lineIds().add(r.line().id());
        }
        return out.values().stream().map(p -> new NewProduct(p.key(), p.title(), p.brand(), p.categoryId(),
                List.copyOf(p.variants()), List.copyOf(p.lineIds()))).toList();
    }

    /** What prevents creation: undecided lines, new products without a category or a price. */
    public static List<String> problems(List<ReviewRow> rows, List<NewProduct> plans, Map<String, Double> prices) {
        List<String> out = new ArrayList<>();
        long open = rows.stream().filter(r -> "open".equals(r.decision().kind())).count();
        if (open > 0) {
            out.add("Не решено строк: " + open + " — выберите товар, «Новый» или «Пропустить»");
        }
        if (rows.stream().allMatch(r -> "skip".equals(r.decision().kind()))) {
            out.add("Все строки пропущены");
        }
        for (NewProduct p : plans) {
            Double price = prices == null ? null : prices.get(p.key());
            if (p.categoryId() == null || p.categoryId().isEmpty()) {
                out.add("«" + p.title() + "»: выберите категорию");
            }
            if (price == null || !(price > 0)) {
                out.add("«" + p.title() + "»: черновая цена продажи");
            }
            if (p.lineIds().size() > 1 && p.variants().isEmpty()) {
                out.add("«" + p.title() + "»: несколько строк без вариантов — разведите названия или задайте варианты");
            }
            if (!p.variants().isEmpty()) {
                variantProblems(rows, p, out);
            }
        }
        return out;
    }

    private static void variantProblems(List<ReviewRow> rows, NewProduct p, List<String> out) {
        for (String id : p.lineIds()) {
            LineDecision d = rows.stream().filter(r -> r.line().id().equals(id)).map(ReviewRow::decision).findFirst().orElse(null);
            if (d != null && "new".equals(d.kind()) && (d.draft().variant() == null || d.draft().variant().isEmpty())) {
                out.add("«" + p.title() + "»: у строки " + id + " не указан вариант (у товара есть варианты "
                        + String.join(", ", p.variants()) + ")");
            }
        }
    }

    /** The product was created on a previous attempt and the variants changed since: lines will not find theirs. */
    public static List<String> variantSetProblems(List<NewProduct> plans, Map<String, Created> created) {
        List<String> out = new ArrayList<>();
        for (NewProduct p : plans) {
            Created c = created.get(p.key());
            if (c == null) {
                continue;
            }
            List<String> missing = p.variants().stream()
                    .filter(v -> c.variants().stream().noneMatch(x -> x.name().equals(v))).toList();
            if (missing.isEmpty()) {
                continue;
            }
            String had = c.variants().isEmpty() ? "без вариантов"
                    : String.join(", ", c.variants().stream().map(CatalogItem.Variant::name).toList());
            out.add("«" + p.title() + "» уже создан с вариантами " + had + " — нет варианта " + String.join(", ", missing)
                    + ". Верните варианты или закройте окно и начните заново");
        }
        return out;
    }

    /** Lines with a product: matched and just created ({@code created} is by {@link #draftKey}). */
    public static List<Resolved> resolvedLines(List<ReviewRow> rows, Map<String, Created> created) {
        List<Resolved> out = new ArrayList<>();
        for (ReviewRow r : rows) {
            LineDecision d = r.decision();
            if ("match".equals(d.kind())) {
                out.add(new Resolved(r.line(), d.productId(), d.variantId()));
            }
            if (!"new".equals(d.kind())) {
                continue;
            }
            Created c = created.get(draftKey(d.draft()));
            if (c == null) {
                continue;
            }
            String variant = d.draft().variant();
            String variantId = variant == null || variant.isEmpty() ? null
                    : c.variants().stream().filter(x -> x.name().equals(variant)).map(CatalogItem.Variant::id).findFirst().orElse(null);
            out.add(new Resolved(r.line(), c.productId(), variantId));
        }
        return out;
    }

    /** Accumulator of one position while merging. */
    private static final class Acc {
        final String productId;
        final String variantId;
        int qty;
        double paid;
        int priced;

        Acc(String productId, String variantId) {
            this.productId = productId;
            this.variantId = variantId;
        }
    }

    /**
     * Supply positions: the same product + variant is one position; the price is the average by quantity. If any
     * line has no price, the position has none: the admin types it in the form instead of getting a foreign price
     * for all pieces.
     */
    public static List<MergedLine> mergeLines(List<Resolved> resolved) {
        Map<String, Acc> out = new LinkedHashMap<>();
        for (Resolved r : resolved) {
            Acc m = out.computeIfAbsent(r.productId() + "|" + (r.variantId() == null ? "" : r.variantId()),
                    k -> new Acc(r.productId(), r.variantId()));
            m.qty += r.line().qty();
            if (r.line().unitPrice() != null) {
                m.paid += r.line().unitPrice() * r.line().qty();
                m.priced += r.line().qty();
            }
        }
        List<MergedLine> lines = new ArrayList<>();
        for (Acc m : out.values()) {
            Double price = m.priced > 0 && m.priced == m.qty ? SupplyChecks.round2(m.paid / m.priced) : null;
            lines.add(new MergedLine(m.productId, m.variantId, m.qty, price));
        }
        return lines;
    }

    /** Pairs for supplier memory: line key to product. */
    public static List<SupplierAlias> aliasesOf(List<Resolved> resolved) {
        return resolved.stream()
                .map(r -> new SupplierAlias(SupplyText.sourceKey(r.line().text(), r.line().variant()), r.productId(), r.variantId()))
                .toList();
    }

    /** Draft sale price: purchase x rate x 2, rounded to 10 UAH. Only a hint - the product is created hidden. */
    public static Double draftPriceUah(Double unitPrice, Double fxRate) {
        if (unitPrice == null || fxRate == null || !(fxRate > 0)) {
            return null;
        }
        return Math.max(10.0, Math.round((unitPrice * fxRate * 2) / 10) * 10.0);
    }
}
