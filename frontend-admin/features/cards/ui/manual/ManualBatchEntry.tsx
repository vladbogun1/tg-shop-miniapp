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
import { MANUAL_PART_SIZE, resumeText } from "../../model/manual-batch";
import { ManualBatchLayer } from "./ManualBatchLayer";
import { openManualLayer, useManualLayerOpen } from "./manual-layer";
import { setManualCurrent, useManualCurrent } from "./use-manual-batch";
import { productsLine, useManualStart } from "./use-manual-start";

export const partsWord = (k: number) => `${k} ${plural(k, "часть", "части", "частей")}`;

/** «Оформить 12 вручную (3 части)». */
export const manualLabel = (n: number) => `Оформить ${n} вручную (${partsWord(Math.ceil(n / MANUAL_PART_SIZE))})`;

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
