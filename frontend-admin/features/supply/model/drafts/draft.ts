/**
 * Черновик «Поставки с ИИ» на экране: новые товары под ключами сервера, шаги работы ИИ и что мешает принять.
 * Чистая логика; правила — те же, что у сервера (`SupplyDraftCards.keyOf`, `SupplyDraftAccept.problems`), сервер
 * проверяет их ещё раз при «Принять».
 */
import { draftPriceUah, newProducts, planProblems, type NewProductPlan } from "../ai/plan";
import type { CatalogItem, ReviewRow } from "../ai/types";

export type DraftStep = "READ" | "MATCH" | "CARDS" | "DONE";
export type DraftStatus = "RUNNING" | "READY" | "FAILED" | "ACCEPTED";
export type StepState = "done" | "active" | "failed" | "waiting";

interface JobRef {
  kind: string;
  key: string | null;
}

/** Новый товар черновика: `id` — ключ сервера (строка документа), под ним лежат его цена, описание и карточка. */
export interface DraftProduct extends NewProductPlan {
  id: string;
}

/** Ключ товара у сервера: строка, у которой уже есть карточка или задача ИИ, иначе первая строка товара. */
export function productKey(lineIds: string[], cards: Record<string, unknown>, jobs: JobRef[]): string {
  return lineIds.find((id) => id in cards || jobs.some((j) => j.kind === "CARD" && j.key === id)) ?? lineIds[0];
}

/** Число из поля ввода («1 250,5» → 1250.5); пусто или мусор — null. */
export function parseAmount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) ? n : null;
}

/** Новые товары из решений строк, с ценой (₴) из `prices` по ключу сервера. */
export function draftProducts(rows: ReviewRow[], cards: Record<string, unknown>, jobs: JobRef[], prices: Record<string, string>): DraftProduct[] {
  return newProducts(rows).map((p) => {
    const id = productKey(p.lineIds, cards, jobs);
    return { ...p, id, priceUah: parseAmount(prices[id]) };
  });
}

export interface ProblemInput {
  rows: ReviewRow[];
  products: DraftProduct[];
  catalog: CatalogItem[];
  leafIds: Set<string>;
  currency: string | null;
  fxRate: number | null;
}

/** Что мешает «Принять»: всё, что сервер откажет, — заранее и по-человечески. */
export function draftProblems(i: ProblemInput): string[] {
  const out = planProblems(i.rows, i.products);
  const withVariants = new Set(i.catalog.filter((c) => c.variants.length > 0).map((c) => c.id));
  for (const r of i.rows) {
    if (r.decision.kind === "match" && !r.decision.variantId && withVariants.has(r.decision.productId)) out.push(`${r.line.id}: выберите вариант товара`);
  }
  if (!i.currency) out.push("Выберите валюту накладной");
  if (!(i.fxRate != null && i.fxRate > 0)) out.push("Введите курс");
  const taken = new Set(i.catalog.map((c) => c.title.trim().toLowerCase()));
  for (const p of i.products) {
    if (taken.has(p.title.trim().toLowerCase())) out.push(`«${p.title}» уже есть в каталоге — выберите его или переименуйте новый`);
    if (p.categoryId && !i.leafIds.has(p.categoryId)) out.push(`«${p.title}»: выберите конечную категорию`);
  }
  return out;
}

export const STEPS: { step: DraftStep; label: string }[] = [
  { step: "READ", label: "Читает накладную" },
  { step: "MATCH", label: "Сопоставляет строки с каталогом" },
  { step: "CARDS", label: "Пишет карточки новых товаров" },
  { step: "DONE", label: "Готово к проверке" },
];

/** Состояние каждого шага: до текущего — сделаны, текущий — идёт или упал, после — ждут. Готовый черновик — всё сделано. */
export function stepStates(step: DraftStep, status: DraftStatus): StepState[] {
  const at = STEPS.findIndex((s) => s.step === step);
  return STEPS.map((_, i) => {
    if (status === "READY" || status === "ACCEPTED" || i < at) return "done";
    if (i > at) return "waiting";
    return status === "FAILED" ? "failed" : "active";
  });
}

/** Что нужно от характеристики, чтобы показать её по-русски. */
export interface SpecAttr {
  labelRu: string;
  unit: string | null;
  options: { value: string; labelRu: string }[];
}

function specText(raw: unknown, attr: SpecAttr | undefined): string {
  const label = (v: unknown) => attr?.options.find((o) => o.value === String(v))?.labelRu ?? String(v);
  if (typeof raw === "boolean") return raw ? "да" : "нет";
  if (Array.isArray(raw)) return raw.map(label).join(", ");
  if (raw && typeof raw === "object") {
    const r = raw as { min?: unknown; max?: unknown };
    return r.min === r.max ? String(r.min ?? "") : `${r.min ?? ""}–${r.max ?? ""}`;
  }
  return label(raw);
}

/** Характеристики карточки ИИ строками «название — значение единица»; пустые пропускаются. */
export function specRows(specs: Record<string, unknown>, attrs: Map<string, SpecAttr>): { key: string; label: string; value: string }[] {
  return Object.entries(specs)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([key, v]) => {
      const attr = attrs.get(key);
      const text = specText(v, attr);
      return { key, label: attr?.labelRu ?? key, value: attr?.unit ? `${text} ${attr.unit}` : text };
    });
}

/**
 * Черновые цены новых товаров, у которых цены ещё нет: средняя закупка по их строкам × курс × 2 (как у сервера,
 * `SupplyDraftCards.proposePrices`). Введённую цену не трогает; без курса или закупки — ничего не предлагает.
 */
export function proposePrices(products: DraftProduct[], rows: ReviewRow[], fxRate: number | null, prices: Record<string, string>): Record<string, string> {
  const out = { ...prices };
  for (const p of products) {
    if (parseAmount(out[p.id]) != null) continue;
    const lines = rows.filter((r) => p.lineIds.includes(r.line.id)).map((r) => r.line);
    const qty = lines.reduce((n, l) => n + l.qty, 0);
    if (qty === 0 || lines.some((l) => l.unitPrice == null)) continue;
    const unit = lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0) / qty;
    const price = draftPriceUah(unit, fxRate);
    if (price != null) out[p.id] = String(price);
  }
  return out;
}
