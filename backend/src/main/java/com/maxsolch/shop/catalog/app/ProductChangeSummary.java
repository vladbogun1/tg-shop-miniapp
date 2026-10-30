package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.util.MoneyFormat;

import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * The words of the audit entry for a product edit: what changed among the money/stock/visibility fields, in the
 * catalog fields (category, brand, condition, characteristics, card) and why the stock went down. Pure functions of
 * the product before and after the save.
 */
final class ProductChangeSummary {

    private static final Map<String, String> WRITEOFF_LABELS = Map.of(
            "DEFECT", "брак", "INVENTORY", "инвентаризация", "MISSORT", "пересорт",
            "SOLD_OFFLINE", "продано вне сайта", "OTHER", "другое");

    private ProductChangeSummary() {
    }

    /** "категория A → B, бренд X → Y, состояние NEW → MARKDOWN, характеристики: +3, ~2, −1". */
    static String catalog(AdminProductDto before, AdminProductDto after) {
        StringBuilder sb = new StringBuilder();
        if (before == null) {
            return "";
        }
        if (!Objects.equals(before.categoryId(), after.categoryId())) {
            sb.append(", категория ").append(pathName(before)).append(" → ").append(pathName(after));
        }
        if (!Objects.equals(before.brand(), after.brand())) {
            sb.append(", бренд ").append(before.brand() == null ? "—" : before.brand()).append(" → ")
                    .append(after.brand() == null ? "—" : after.brand());
        }
        if (!Objects.equals(before.condition(), after.condition())) {
            sb.append(", состояние ").append(before.condition()).append(" → ").append(after.condition());
        }
        Map<String, Object> a = before.specs() == null ? Map.of() : before.specs();
        Map<String, Object> b = after.specs() == null ? Map.of() : after.specs();
        int added = 0;
        int changed = 0;
        int removed = 0;
        for (var e : b.entrySet()) {
            if (!a.containsKey(e.getKey())) {
                added++;
            } else if (!Objects.equals(String.valueOf(a.get(e.getKey())), String.valueOf(e.getValue()))) {
                changed++;
            }
        }
        for (String k : a.keySet()) {
            if (!b.containsKey(k)) {
                removed++;
            }
        }
        if (added + changed + removed > 0) {
            sb.append(", характеристики: +").append(added).append(", ~").append(changed).append(", −").append(removed);
        }
        if (!Objects.equals(before.cardStatus(), after.cardStatus())) {
            sb.append(", карточка ").append(before.cardStatus()).append(" → ").append(after.cardStatus());
        }
        return sb.toString();
    }

    private static String pathName(AdminProductDto p) {
        return p.tags() == null || p.tags().isEmpty() ? "—"
                : String.join(" › ", p.tags().stream().map(t -> t.name()).toList());
    }

    /** "цена 1 200 ₴ → 900 ₴, сток 3 → 5" — only what changed among the money/stock/visibility fields. */
    static String changes(AdminProductDto before, AdminProductDto after) {
        StringBuilder sb = new StringBuilder(after.title());
        if (before == null) {
            return sb.append(", цена ").append(MoneyFormat.uah(after.priceMinor())).append(", сток ").append(after.stock())
                    .toString();
        }
        if (before.priceMinor() != after.priceMinor()) {
            sb.append(", цена ").append(MoneyFormat.uah(before.priceMinor())).append(" → ")
                    .append(MoneyFormat.uah(after.priceMinor()));
        }
        if (before.stock() != after.stock()) {
            sb.append(", сток ").append(before.stock()).append(" → ").append(after.stock());
        }
        if (before.active() != after.active()) {
            sb.append(after.active() ? ", показан" : ", скрыт");
        }
        if (!Objects.equals(before.title(), after.title())) {
            sb.append(", было «").append(before.title()).append('»');
        }
        return sb.toString();
    }

    /** ", причина списания: брак (текст)" when the save lowered the product's or a variant's stock. */
    static String writeoff(AdminProductDto before, AdminProductDto after, ProductUpsertRequest req) {
        if (req.stockReason() == null || !stockDropped(before, after)) {
            return "";
        }
        String label = WRITEOFF_LABELS.getOrDefault(req.stockReason().trim().toUpperCase(Locale.ROOT),
                req.stockReason());
        String note = req.stockNote() == null || req.stockNote().isBlank() ? "" : " (" + req.stockNote().trim() + ")";
        return ", причина списания: " + label + note;
    }

    private static boolean stockDropped(AdminProductDto before, AdminProductDto after) {
        if (before == null) {
            return false;
        }
        if (after.stock() < before.stock()) {
            return true;
        }
        if (before.variants() == null || after.variants() == null) {
            return false;
        }
        for (var b : before.variants()) {
            for (var a : after.variants()) {
                if (Objects.equals(a.id(), b.id()) && a.stock() < b.stock()) {
                    return true;
                }
            }
        }
        return false;
    }
}
