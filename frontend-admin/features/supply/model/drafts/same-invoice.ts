import type { Schemas } from "@shop/core/api/schemas";

/** Черновик, где уже есть тот же файл накладной (загружен ещё раз): открыть его, а не платить за ИИ второй раз. */
export type SameInvoice = Schemas["SameInvoice"];

const STATE: Record<SameInvoice["status"], string> = {
  RUNNING: "ИИ ещё разбирает",
  READY: "ждёт проверки",
  FAILED: "ИИ не справился",
  ACCEPTED: "уже принята",
};

/** Куда вести: принятая — в поставку, остальные — в черновик. */
export function sameInvoiceHref(d: SameInvoice): string {
  return d.status === "ACCEPTED" && d.batchId ? `/preorders/${d.batchId}` : `/preorders/drafts/${d.id}`;
}

/** «Черновик №1 «WESTLAB» — ждёт проверки» / «Поставка №5 «WESTLAB» — уже принята». */
export function sameInvoiceLabel(d: SameInvoice): string {
  const what = d.status === "ACCEPTED" && d.batchId ? `Поставка №${d.batchId}` : `Черновик №${d.id}`;
  const title = d.title ? ` «${d.title}»` : "";
  return `${what}${title} — ${STATE[d.status] ?? d.status}`;
}
