import type { ReviewStatus } from "./types";

/** Что можно сделать с отзывом в его статусе (как в старом: «Опубликовать» нет у опубликованного, «Скрыть» — у скрытого). */
export interface ReviewActionSet {
  publish: boolean;
  hide: boolean;
  /** Удалить навсегда — только главный админ (SUPER_ADMIN). */
  remove: boolean;
}

export function actionsFor(status: ReviewStatus, canDelete: boolean): ReviewActionSet {
  return { publish: status !== "PUBLISHED", hide: status !== "HIDDEN", remove: canDelete };
}

/**
 * Какой отзыв открыть, когда выбранный пропал из списка (опубликовали, скрыли, удалили): следующий за ним,
 * иначе предыдущий из тех, что остались. `prevIds` — порядок до действия, `nextIds` — после.
 */
export function pickAfterRemoval(prevIds: number[], nextIds: number[], goneId: number): number | null {
  const at = prevIds.indexOf(goneId);
  if (at < 0) return nextIds[0] ?? null;
  const alive = new Set(nextIds);
  for (let i = at + 1; i < prevIds.length; i++) if (alive.has(prevIds[i])) return prevIds[i];
  for (let i = at - 1; i >= 0; i--) if (alive.has(prevIds[i])) return prevIds[i];
  return null;
}

/** Соседний отзыв в списке (J/K, стрелки); на краю остаётся на месте. */
export function neighborId(ids: number[], currentId: number | null, delta: -1 | 1): number | null {
  if (ids.length === 0) return null;
  const at = currentId == null ? -1 : ids.indexOf(currentId);
  if (at < 0) return ids[delta === 1 ? 0 : ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
}

/** Быстрые ответы-заготовки над полем ответа (текст подставляется, правится руками). */
export const REPLY_TEMPLATES: { id: string; label: string; text: string }[] = [
  { id: "thanks", label: "Спасибо", text: "Спасибо за отзыв! Рады, что вам понравилось." },
  { id: "sorry", label: "Извинения", text: "Приносим извинения за неудобства. Напишите нам в поддержку — разберёмся и всё исправим." },
  { id: "warranty", label: "Гарантия", text: "Заменим товар по гарантии — напишите нам в поддержку, подскажем, как оформить." },
];
