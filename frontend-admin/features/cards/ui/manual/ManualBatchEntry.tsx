"use client";

/**
 * Входы в ручной пакет: кнопка по выбранным товарам (когда встроенный ИИ недоступен), кнопка у пакета ИИ на паузе
 * или после него («Оформить N вручную (K частей)») и полоса «Продолжить ручной пакет» после перезагрузки.
 */
import { manualSubjects, useCancelBatch, type AiBatch } from "@/features/ai";
import { plural } from "@/features/translation";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { clearDraft, loadDraft, MANUAL_PART_SIZE, newDraft, progressText, sameIds, saveDraft, type ManualDraft } from "../../model/manual-batch";
import { sortForWizard } from "../../model/wizard";
import { useCardItems, useCardSchema } from "../../queries";
import { draftChanged, useDraftVersion } from "./draft-signal";
import { ManualBatchLayer } from "./ManualBatchLayer";
import { useManualBatch } from "./use-manual-batch";

export const partsWord = (k: number) => `${k} ${plural(k, "часть", "части", "частей")}`;

/** «Оформить 12 вручную (3 части)». */
export const manualLabel = (n: number) => `Оформить ${n} вручную (${partsWord(Math.ceil(n / MANUAL_PART_SIZE))})`;

const draftLine = (d: ManualDraft) => `${d.ids.length} ${plural(d.ids.length, "товар", "товара", "товаров")}, часть ${d.part + 1} из ${d.answers.length}`;

/** Начать ручной пакет по товарам или продолжить тот же; чужой незаконченный — только с согласия. */
export function useManualOpener() {
  const items = useCardItems().data;
  const schema = useCardSchema().data;
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  async function start(productIds: string[]): Promise<boolean> {
    if (!items || !schema) return false;
    const existing = loadDraft();
    if (existing && sameIds(existing, productIds)) {
      setOpen(true);
      return true;
    }
    if (existing) {
      const ok = await confirm({
        title: "Начать новый ручной пакет?",
        message: `Есть незаконченный: ${draftLine(existing)}. Его вставленные ответы удалятся.`,
        confirmLabel: "Начать новый",
        cancelLabel: "Отмена",
        danger: true,
      });
      if (!ok) return false;
    }
    const wanted = new Set(productIds);
    const chosen = sortForWizard(items.filter((i) => wanted.has(i.id)), schema);
    if (chosen.length === 0) {
      toast.info("Этих товаров уже нет в каталоге");
      return false;
    }
    if (!saveDraft(newDraft(chosen))) toast.info("Браузер не даёт сохранить черновик — после перезагрузки вставленное пропадёт");
    setOpen(true);
    return true;
  }
  return { start, ready: !!items && !!schema, layer: <ManualBatchLayer open={open} onClose={() => setOpen(false)} /> };
}

export type ManualOpener = ReturnType<typeof useManualOpener>;

function OpenButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => Promise<unknown> }) {
  return (
    <Button size="sm" variant="surface" icon={<ClipboardList className="h-4 w-4" />} disabled={disabled} onClick={() => void onClick()} data-testid="manual-open">
      {label}
    </Button>
  );
}

/** Кнопка ручного пакета по выбранным товарам (слой живёт рядом с кнопкой). */
export function ManualBatchButton({ productIds, label }: { productIds: string[]; label?: string }) {
  const o = useManualOpener();
  return (
    <>
      <OpenButton label={label ?? manualLabel(productIds.length)} disabled={!o.ready || productIds.length === 0} onClick={() => o.start(productIds)} />
      {o.layer}
    </>
  );
}

/**
 * У пакета ИИ: то, что он не сделал. Пакет на паузе сначала заканчиваем — иначе «Продолжить» потом отдал бы
 * встроенному ИИ те же товары ещё раз (двойная работа и двойные деньги). Слой держит `opener` хозяина полосы:
 * после «Закончить» полоса пакета сменяется итогом, и слой внутри неё закрылся бы.
 */
export function ManualFromBatch({ batch, opener }: { batch: AiBatch; opener: ManualOpener }) {
  const cancel = useCancelBatch();
  const confirm = useConfirm();
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
    await opener.start(ids);
  }
  return <OpenButton label={manualLabel(ids.length)} disabled={!opener.ready} onClick={open} />;
}

function ResumeLine() {
  const m = useManualBatch(true);
  if (!m.draft || !m.current) return null;
  return <>{m.draft.stage === "review" ? `проверка, осталось ${m.pending.length}` : progressText(m.draft, m.current.answered, m.current.size)}</>;
}

/** «Ручной пакет: часть 2 из 6, вставлено 1 из 4 · Продолжить · Удалить» — пока есть черновик. */
export function ManualResumeBar() {
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const version = useDraftVersion();
  useEffect(() => {
    if (!open) setDraft(loadDraft());
  }, [open, version]);
  if (!draft && !open) return null;
  return (
    <>
      {draft && !open && (
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px]" data-testid="manual-resume">
          <ClipboardList className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1 basis-48 font-semibold text-[var(--ink)]">
            Ручной пакет: <ResumeLine key={version} />
          </span>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const ok = await confirm({ title: "Удалить ручной пакет?", message: "Вставленные ответы пропадут. Уже принятые карточки останутся.", confirmLabel: "Удалить", cancelLabel: "Отмена", danger: true });
                if (!ok) return;
                clearDraft();
                draftChanged();
              }}
            >
              Удалить
            </Button>
            <Button size="sm" variant="accent" onClick={() => setOpen(true)} data-testid="manual-resume-open">
              Продолжить
            </Button>
          </div>
        </div>
      )}
      <ManualBatchLayer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
