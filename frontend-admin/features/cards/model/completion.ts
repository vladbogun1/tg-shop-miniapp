/**
 * «Карточки»: итог записи одного товара из окна оформления — что сказать человеку, если товар не выложился
 * (нет цены, категории или карточка осталась черновиком). Чистая логика.
 */
import { parseCardAnswer } from "./parse";
import { buildCardReview, type ReviewContext } from "./review";
import type { ProductReview } from "./types";

/** То, что окно читает из итога записи товара (`CardItemResult`; `missing`/`message` бэкенд пока не присылает). */
export interface PublishOutcome {
  published?: boolean;
  reason?: string | null;
  missing?: string[] | null;
  message?: string | null;
  translated?: Record<string, number> | null;
}

export interface PublishProblem {
  text: string;
  needPrice: boolean;
}

export const HIDDEN_TOAST = "Товар сохранён скрытым. Доделать — «Карточки → Оформить»";

/** « · переводы UA 3 / EN 3» — сколько переводов сохранено (пусто, если ни одного). */
export function translatedNote(r: PublishOutcome | undefined): string {
  const t = r?.translated;
  const uk = t?.uk ?? 0;
  const en = t?.en ?? 0;
  if (uk + en === 0) return "";
  return ` · переводы UA ${uk} / EN ${en}`;
}

function needsPrice(r: PublishOutcome, missing: string[], msg: string, priceMinor: number | null | undefined): boolean {
  return missing.some((m) => m.includes("price")) || /цен|price/i.test(msg) || (r.reason === "PRODUCT_NOT_PUBLISHABLE" && !priceMinor);
}

function needsCategory(missing: string[], msg: string): boolean {
  return missing.some((m) => m.includes("categor")) || /категор|category/i.test(msg);
}

/** Почему сервер не выложил товар; null — выложен (или итога нет). */
export function publishProblem(r: PublishOutcome | undefined, priceMinor: number | null | undefined): PublishProblem | null {
  if (!r || r.published) return null;
  const missing = (r.missing ?? []).map((m) => m.toLowerCase());
  const msg = r.message ?? "";
  if (r.reason === "CARD_NOT_READY") {
    // The card stayed a DRAFT: nothing that fills it (characteristics / title / description) was applied.
    return {
      text: `Карточка осталась черновиком — из ответа ИИ не сохранено ни характеристик, ни текстов${msg ? ` (${msg})` : ""}. Черновик не выкладывается: отметьте поля из ответа или выложите товар из редактора кнопкой «Выложить без оформления».`,
      needPrice: false,
    };
  }
  const needPrice = needsPrice(r, missing, msg, priceMinor);
  const parts: string[] = [];
  if (needPrice) parts.push("не указана цена");
  if (needsCategory(missing, msg)) parts.push("не выбрана категория — примите категорию из ответа ИИ или задайте её в товаре");
  if (!parts.length) parts.push(msg || r.reason || "сервер не выложил товар");
  return { text: `Не выложено: ${parts.join("; ")}.`, needPrice };
}

// ---- проверка ответа ИИ для одного товара ------------------------------------------------

export interface AnswerCheck {
  errors: string[];
  notes: string[];
  product: ProductReview | null;
  /** Ответ пуст или без единой записи: окно оставляет прежний выбор и проблему как есть. */
  empty: boolean;
}

/** Ответ ИИ → разбор для ОДНОГО товара: ответ под любым единственным id принимается за него (ИИ иногда портит id). */
export function reviewAnswer(text: string, ctx: ReviewContext, productId: string): AnswerCheck {
  const parsed = parseCardAnswer(text);
  const errors = [...parsed.errors];
  if (!text.trim() || parsed.entries.size === 0) return { errors, notes: parsed.notes, product: null, empty: true };
  let r = buildCardReview(parsed, ctx);
  if (!r.products.length && parsed.entries.size === 1 && r.unknown.length === 1) {
    const only = parsed.entries.values().next().value;
    r = buildCardReview({ ...parsed, entries: new Map([[ctx.ids.get(productId)!, only]]) }, ctx);
    parsed.notes.push(`id «${[...parsed.entries.keys()][0]}» не совпал — ответ взят для этого товара`);
  }
  if (r.unknown.length) errors.push(`В ответе другие товары (${r.unknown.join(", ")}) — пропущены.`);
  for (const x of r.invalid) errors.push(`${x.id}: ${x.problems.join("; ")}`);
  return { errors, notes: parsed.notes, product: r.products[0] ?? null, empty: false };
}
