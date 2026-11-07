"use client";

/**
 * Входы в ручной пакет «Через ChatGPT вручную» — один путь для любого выбора товаров: кнопка в панели выбора
 * («Товары», «Карточки»; работает и без ИИ), «Оформить N вручную» у пакета ИИ для того, что он не сделал, и полоса
 * «Продолжить ручной пакет» — по пакету на сервере, поэтому видна и на другом устройстве. Слой один — `ManualBatchLayer`.
 */
import { manualSubjects, useCancelBatch, type AiBatch } from "@/features/ai";
import { plural } from "@/features/translation";
import { errorMessage } from "@shop/core/errors";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { manualApi, type ManualBatch } from "../../api-manual";
import { cardVersion } from "../../model/ai-card";
import type { CardItem } from "../../model/item";
import { freshDraft, MANUAL_PART_SIZE, resumeText, sameProducts, sortForBatch } from "../../model/manual-batch";
import type { CardSchema } from "../../model/schema";
import { useCardItems, useCardSchema } from "../../queries";
import { ManualBatchLayer } from "./ManualBatchLayer";
import { openManualLayer, useManualLayerOpen } from "./manual-layer";
import { setManualCurrent, useManualCurrent } from "./use-manual-batch";

/** Сервер берёт в ручной пакет до 100 товаров. */
export const MANUAL_MAX = 100;

export const partsWord = (k: number) => `${k} ${plural(k, "часть", "части", "частей")}`;

/** «Оформить 12 вручную (3 части)». */
export const manualLabel = (n: number) => `Оформить ${n} вручную (${partsWord(Math.ceil(n / MANUAL_PART_SIZE))})`;

const productsLine = (n: number) => `${n} ${plural(n, "товар", "товара", "товаров")}`;

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

/** «Через ChatGPT вручную (N)» по выбранным товарам — без ИИ, ключа и лимитов. */
export function ManualStartButton({ productIds, label, variant = "surface" }: { productIds: string[]; label?: string; variant?: "surface" | "accent" }) {
  const o = useManualStart();
  return (
    <Button
      size="sm"
      variant={variant}
      icon={<ClipboardList className="h-4 w-4" />}
      loading={o.busy}
      disabled={!o.ready || productIds.length === 0}
      onClick={() => void o.start(productIds)}
      data-testid="manual-open"
    >
      {label ?? `Через ChatGPT вручную (${productIds.length})`}
    </Button>
  );
}

/**
 * У пакета ИИ: то, что он не сделал. Пакет на паузе сначала заканчиваем — иначе «Продолжить» потом отдал бы
 * встроенному ИИ те же товары ещё раз (двойная работа и двойные деньги).
 */
export function ManualFromBatch({ batch }: { batch: AiBatch }) {
  const cancel = useCancelBatch();
  const confirm = useConfirm();
  const o = useManualStart();
  const ids = manualSubjects(batch);
  if (ids.length === 0) return null;
  async function open() {
    if (batch.status === "PAUSED") {
      const ok = await confirm({
        title: `Закончить пакет и оформить ${ids.length} вручную?`,
        message: "Готовое останется на проверку. Оставшиеся товары встроенный ИИ делать уже не будет — они уйдут в ручной пакет по частям.",
        confirmLabel: "Закончить и оформить",
        cancelLabel: "Отмена",
      });
      if (!ok) return;
      await cancel.mutateAsync(batch.id);
    }
    await o.start(ids);
  }
  return (
    <Button size="sm" variant="surface" icon={<ClipboardList className="h-4 w-4" />} loading={o.busy} disabled={!o.ready} onClick={() => void open()} data-testid="manual-open">
      {manualLabel(ids.length)}
    </Button>
  );
}

function ResumeBar({ batch }: { batch: ManualBatch }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const line = resumeText(batch.draft, batch.items.map((i) => i.subjectId), batch.partSize, batch.batch.jobs);

  async function discard() {
    const ok = await confirm({
      title: "Удалить ручной пакет?",
      message: "Непринятые вставленные ответы пропадут. Уже принятые карточки останутся.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await manualApi.discard(batch.batch.id);
      setManualCurrent(qc, null);
    } catch (e) {
      toast.error(errorMessage(e, undefined, "Не удалось удалить пакет"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px]" data-testid="manual-resume">
      <ClipboardList className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1 basis-48 font-semibold text-[var(--ink)]">
        Ручной пакет ({productsLine(batch.items.length)}): {line}
      </span>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void discard()} data-testid="manual-resume-discard">
          Удалить
        </Button>
        <Button size="sm" variant="accent" onClick={openManualLayer} data-testid="manual-resume-open">
          Продолжить
        </Button>
      </div>
    </div>
  );
}

/** Полоса «Ручной пакет: часть 2 из 6, вставлено 1 из 4 · Продолжить · Удалить» и слой пакета экрана. */
export function ManualResumeBar() {
  const current = useManualCurrent().data;
  const open = useManualLayerOpen();
  return (
    <>
      {current && !open && <ResumeBar batch={current} />}
      <ManualBatchLayer />
    </>
  );
}
