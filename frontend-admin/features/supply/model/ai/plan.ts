/**
 * Итог проверки → что создать: новые товары (скрытые черновики; одинаковое название = один товар с вариантами),
 * позиции поставки (одинаковый товар+вариант складываются) и пары для памяти поставщика. Чистая логика.
 */
import { round2 } from "./checks";
import { sourceKey } from "./normalize";
import type { NewProductDraft, ReviewRow, SourceLine } from "./types";

export interface NewProductPlan {
  key: string;
  title: string;
  brand: string | null;
  categoryId: string | null;
  /** Пусто — товар без вариантов. */
  variants: string[];
  /** Черновая цена продажи, ₴ — товар скрыт, её правят до публикации. */
  priceUah: number | null;
  /** Строки документа этого товара. */
  lineIds: string[];
}

export const draftKey = (d: NewProductDraft) => d.title.trim().toLowerCase();

/** Новые товары из решений «new». Цена — из `prices` по ключу товара. */
export function newProducts(rows: ReviewRow[], prices: Record<string, number | null> = {}): NewProductPlan[] {
  const out = new Map<string, NewProductPlan>();
  for (const r of rows) {
    if (r.decision.kind !== "new") continue;
    const d = r.decision.draft;
    const key = draftKey(d);
    const plan = out.get(key) ?? { key, title: d.title.trim(), brand: d.brand, categoryId: d.categoryId, variants: [], priceUah: prices[key] ?? null, lineIds: [] };
    if (d.variant && !plan.variants.includes(d.variant)) plan.variants.push(d.variant);
    plan.lineIds.push(r.line.id);
    out.set(key, plan);
  }
  return [...out.values()];
}

/** Что мешает создать: нерешённые строки, новые товары без категории или цены. */
export function planProblems(rows: ReviewRow[], plans: NewProductPlan[]): string[] {
  const out: string[] = [];
  const open = rows.filter((r) => r.decision.kind === "open").length;
  if (open) out.push(`Не решено строк: ${open} — выберите товар, «Новый» или «Пропустить»`);
  if (rows.every((r) => r.decision.kind === "skip")) out.push("Все строки пропущены");
  for (const p of plans) {
    if (!p.categoryId) out.push(`«${p.title}»: выберите категорию`);
    if (!(p.priceUah != null && p.priceUah > 0)) out.push(`«${p.title}»: черновая цена продажи`);
    if (p.lineIds.length > 1 && p.variants.length === 0) out.push(`«${p.title}»: несколько строк без вариантов — разведите названия или задайте варианты`);
    if (p.variants.length > 0) {
      for (const id of p.lineIds) {
        const d = rows.find((r) => r.line.id === id)?.decision;
        if (d?.kind === "new" && !d.draft.variant) out.push(`«${p.title}»: у строки ${id} не указан вариант (у товара есть варианты ${p.variants.join(", ")})`);
      }
    }
  }
  return out;
}

/** Товар уже создан на прошлой попытке, а варианты с тех пор поменяли: строки не найдут свой вариант. */
export function variantSetProblems(plans: NewProductPlan[], created: Map<string, Created>): string[] {
  const out: string[] = [];
  for (const p of plans) {
    const c = created.get(p.key);
    if (!c) continue;
    const missing = p.variants.filter((v) => !c.variants.some((x) => x.name === v));
    if (missing.length === 0) continue;
    const had = c.variants.map((v) => v.name).join(", ") || "без вариантов";
    out.push(`«${p.title}» уже создан с вариантами ${had} — нет варианта ${missing.join(", ")}. Верните варианты или закройте окно и начните заново`);
  }
  return out;
}

/** Созданный товар: id и варианты по названию. */
export interface Created {
  productId: string;
  variants: { id: string; name: string }[];
}

export interface Resolved {
  line: SourceLine;
  productId: string;
  variantId: string | null;
}

/** Строки с товаром: найденные и только что созданные (`created` — по ключу draftKey). */
export function resolvedLines(rows: ReviewRow[], created: Map<string, Created>): Resolved[] {
  const out: Resolved[] = [];
  for (const r of rows) {
    const d = r.decision;
    if (d.kind === "match") out.push({ line: r.line, productId: d.productId, variantId: d.variantId });
    if (d.kind !== "new") continue;
    const c = created.get(draftKey(d.draft));
    if (!c) continue;
    const v = d.draft.variant ? c.variants.find((x) => x.name === d.draft.variant) : undefined;
    out.push({ line: r.line, productId: c.productId, variantId: v?.id ?? null });
  }
  return out;
}

export interface MergedLine {
  productId: string;
  variantId: string | null;
  qty: number;
  unitPrice: number | null;
}

/**
 * Позиции поставки: одинаковый товар+вариант — одна позиция; цена — средняя по количеству. Если хоть у одной строки
 * цены нет, цены у позиции нет: админ впишет её в форме, а не получит чужую цену на все штуки.
 */
export function mergeLines(resolved: Resolved[]): MergedLine[] {
  const out = new Map<string, MergedLine & { paid: number; priced: number }>();
  for (const r of resolved) {
    const k = `${r.productId}|${r.variantId ?? ""}`;
    const m = out.get(k) ?? { productId: r.productId, variantId: r.variantId, qty: 0, unitPrice: null, paid: 0, priced: 0 };
    m.qty += r.line.qty;
    if (r.line.unitPrice != null) {
      m.paid += r.line.unitPrice * r.line.qty;
      m.priced += r.line.qty;
    }
    m.unitPrice = m.priced && m.priced === m.qty ? round2(m.paid / m.priced) : null;
    out.set(k, m);
  }
  return [...out.values()].map(({ productId, variantId, qty, unitPrice }) => ({ productId, variantId, qty, unitPrice }));
}

/** Пары для памяти поставщика: ключ строки → товар. */
export function aliasesOf(resolved: Resolved[]) {
  return resolved.map((r) => ({ sourceKey: sourceKey(r.line.text, r.line.variant), productId: r.productId, variantId: r.variantId }));
}

/** Черновая цена продажи: закупка × курс × 2, до 10 ₴. Только подсказка — товар создаётся скрытым. */
export function draftPriceUah(unitPrice: number | null, fxRate: number | null): number | null {
  if (unitPrice == null || fxRate == null || !(fxRate > 0)) return null;
  return Math.max(10, Math.round((unitPrice * fxRate * 2) / 10) * 10);
}
