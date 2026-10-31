/** Building and merging rows of the case board (new prizes, «Автособрать» result, rows for the test modal). */
import type { CaseRarity, CaseTier } from "@shop/core/giftcase";
import type { AdminProduct } from "@/features/product";
import { productStock } from "@/lib/stock";
import { defaultDiscountUah, fromDraftItem, newKey, type Row, type Summary } from "./case-draft";
import type { AutofillResult, CaseItemAdmin, DraftItem } from "./types";

const byOrder = (a: CaseItemAdmin, b: CaseItemAdmin) => a.sortOrder - b.sortOrder || a.id - b.id;

/** The published prizes of one tier, in the order the shop shows them. */
export function publishedOf(items: CaseItemAdmin[] | undefined, tier: CaseTier): CaseItemAdmin[] {
  return (items ?? []).filter((it) => it.tier === tier).sort(byOrder);
}

/** A catalog product as a draft prize (a new one: no id). */
export function catalogItem(p: AdminProduct, rarity: CaseRarity, weight: number): DraftItem {
  return {
    id: null,
    kind: "PRODUCT",
    productId: p.id,
    discountPercent: 0,
    discountUah: 0,
    rarity,
    weight,
    active: true,
    title: p.title,
    imageUrl: p.images?.[0]?.url ?? null,
    priceMinor: p.priceMinor,
    stock: productStock(p),
    productActive: p.active !== false && !p.archived,
    category: null,
  };
}

/** A product prize with no chance yet (`addRow` gives it the default of its rarity). */
export function productRow(rarity: CaseRarity, p: AdminProduct): Row {
  return { ...catalogItem(p, rarity, 0), key: newKey() };
}

/** A discount prize worth the default amount of its rarity. */
export function discountRow(rarity: CaseRarity, thresholdUah: number): Row {
  const uah = defaultDiscountUah(rarity, thresholdUah);
  return {
    key: newKey(),
    id: null,
    kind: "DISCOUNT",
    productId: null,
    discountPercent: 0,
    discountUah: uah,
    rarity,
    weight: 0,
    active: true,
    title: `Скидка ${uah} ₴`,
    imageUrl: null,
    priceMinor: 0,
    stock: 0,
    productActive: true,
    category: null,
  };
}

/** The draft after «Автособрать»: locked prizes come back as they were, with their new chance. */
export function mergeAutofill(rows: Row[], published: CaseItemAdmin[], res: AutofillResult): Row[] {
  const locked = rows.filter((r) => r.locked);
  return res.items.map((x) => {
    // A locked prize comes back as it was (key, lock) with its new chance.
    const keep = locked.find((r) => (x.productId ? r.productId === x.productId : r.kind === "DISCOUNT" && r.id != null && r.id === x.id));
    if (keep) return { ...keep, weight: x.weight };
    // A product already published keeps its row id.
    const old = x.productId ? published.find((it) => it.productId === x.productId) : undefined;
    return fromDraftItem(old ? { ...x, id: old.id } : x);
  });
}

/** A board row as the test modal reads it; a new draft prize gets the test's id −(index + 1). */
export function toAdminItem(r: Row, i: number, tier: CaseTier, sum: Summary): CaseItemAdmin {
  return {
    id: r.id ?? -(i + 1),
    tier,
    kind: r.kind,
    productId: r.productId,
    title: r.title,
    imageUrl: r.imageUrl,
    priceMinor: r.priceMinor,
    stock: r.stock,
    productActive: r.productActive,
    discountPercent: r.discountPercent,
    discountUah: r.discountUah,
    rarity: r.rarity,
    weight: r.weight,
    chancePercent: sum.chance.get(r.key) ?? 0,
    sortOrder: (i + 1) * 10,
    active: r.active,
  };
}
