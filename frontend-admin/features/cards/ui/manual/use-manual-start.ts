"use client";

/**
 * Начать ручной пакет «Через ChatGPT вручную» по выбранным товарам: тот же набор — продолжить, другой незаконченный —
 * только с согласия удалить его. Общее для кнопок входа (`ManualBatchEntry`) и экрана «Карточки».
 */
import { plural } from "@/features/translation";
import { errorMessage } from "@shop/core/errors";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { manualApi, type ManualBatch } from "../../api-manual";
import { cardVersion } from "../../model/ai-card";
import type { CardItem } from "../../model/item";
import { freshDraft, MANUAL_PART_SIZE, resumeText, sameProducts, sortForBatch } from "../../model/manual-batch";
import type { CardSchema } from "../../model/schema";
import { useCardItems, useCardSchema } from "../../queries";
import { openManualLayer } from "./manual-layer";
import { setManualCurrent } from "./use-manual-batch";

/** Сервер берёт в ручной пакет до 100 товаров. */
export const MANUAL_MAX = 100;

export const productsLine = (n: number) => `${n} ${plural(n, "товар", "товара", "товаров")}`;


/** Товары пакета по категории и названию, не больше `MANUAL_MAX`. */
function pick(productIds: string[], items: CardItem[], schema: CardSchema): CardItem[] {
  const wanted = new Set(productIds);
  const chosen = sortForBatch(items.filter((i) => wanted.has(i.id)), schema);
  if (chosen.length > MANUAL_MAX) toast.info(`В ручной пакет взяты первые ${MANUAL_MAX} из ${chosen.length}: остальные — следующим пакетом`);
  return chosen.slice(0, MANUAL_MAX);
}

/** Начать ручной пакет по товарам; тот же набор — продолжить; другой незаконченный — только с согласия удалить его. */
export function useManualStart() {
  const qc = useQueryClient();
  const items = useCardItems().data;
  const schema = useCardSchema().data;
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const show = (b: ManualBatch) => {
    setManualCurrent(qc, b);
    openManualLayer();
  };

  async function replaceOld(old: ManualBatch): Promise<boolean> {
    const ok = await confirm({
      title: "Начать новый ручной пакет?",
      message: `Есть незаконченный: ${productsLine(old.items.length)}, ${resumeText(old.draft, old.items.map((i) => i.subjectId), old.partSize, old.batch.jobs)}. Его непринятые ответы удалятся, принятые карточки останутся.`,
      confirmLabel: "Удалить и начать новый",
      cancelLabel: "Отмена",
      danger: true,
    });
    if (ok) await manualApi.discard(old.batch.id);
    return ok;
  }

  async function begin(chosen: CardItem[]): Promise<boolean> {
    const existing = await manualApi.current();
    if (existing && sameProducts(existing.items.map((i) => i.subjectId), chosen.map((i) => i.id))) {
      show(existing);
      return true;
    }
    if (existing && !(await replaceOld(existing))) return false;
    const items = chosen.map((i) => ({ productId: i.id, subjectVersion: cardVersion(i) }));
    show(await manualApi.start({ items, partSize: MANUAL_PART_SIZE, draft: JSON.stringify(freshDraft(chosen.length)) }));
    return true;
  }

  async function start(productIds: string[]): Promise<boolean> {
    if (!items || !schema) return false;
    const chosen = pick(productIds, items, schema);
    if (chosen.length === 0) {
      toast.info("Этих товаров уже нет в каталоге");
      return false;
    }
    setBusy(true);
    try {
      return await begin(chosen);
    } catch (e) {
      toast.error(errorMessage(e, undefined, "Не удалось начать ручной пакет"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { start, busy, ready: !!items && !!schema };
}
