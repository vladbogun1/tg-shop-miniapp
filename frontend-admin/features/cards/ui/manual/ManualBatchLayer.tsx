"use client";

/**
 * Слой ручного пакета поверх любой страницы: части → проверка. Всё вставленное сразу пишется в черновик, поэтому
 * закрыть можно в любой момент; если что-то вставлено, спрашиваем по макету: «Выйти, сохранив вставленное?».
 */
import { CenterSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useConfirm } from "@shop/ui/confirm";
import { useOverlayLayer } from "@shop/ui/overlay";
import { ClipboardList, X } from "lucide-react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { clearDraft, progressText } from "../../model/manual-batch";
import { draftChanged } from "./draft-signal";
import { ManualPartStep } from "./ManualPartStep";
import { ManualReviewStage } from "./ManualReviewStage";
import { useManualBatch, type ManualBatch } from "./use-manual-batch";

/** Вставлено ли хоть что-то, что жалко потерять. */
const hasWork = (m: ManualBatch) => !!m.draft && (m.draft.answers.some((a) => a.trim()) || m.draft.done.length > 0);

function Body({ m, onClose }: { m: ManualBatch; onClose: () => void }) {
  if (!m.draft) return <p className="text-[13px] text-[var(--text-muted)]">Черновика ручного пакета нет — выберите товары и начните заново.</p>;
  if (m.loading) return <CenterSpinner label="Загрузка карточек…" />;
  return m.draft.stage === "review" ? <ManualReviewStage m={m} onClose={onClose} /> : <ManualPartStep m={m} />;
}

export function ManualBatchLayer({ open, onClose: close }: { open: boolean; onClose: () => void }) {
  const m = useManualBatch(open);
  const confirm = useConfirm();
  const onClose = () => {
    close();
    draftChanged();
  };

  async function requestClose() {
    if (!hasWork(m)) {
      // Пустой черновик не держим: иначе «Продолжить ручной пакет» висел бы без смысла.
      if (m.draft) clearDraft();
      onClose();
      return;
    }
    const d = m.draft!;
    const ok = await confirm({
      title: "Выйти, сохранив вставленное?",
      message: `Черновик хранится на этом устройстве. Вернуться: «${progressText(d, m.current?.answered ?? 0, m.current?.size ?? 0)}».`,
      confirmLabel: "Сохранить и выйти",
      cancelLabel: "Остаться",
    });
    if (ok) onClose();
  }

  useOverlayLayer(open, () => void requestClose());
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ручной пакет карточек"
      style={{ "--bottom-nav": "0px" } as CSSProperties}
      className={cn("fixed inset-0 z-[110] flex flex-col bg-[var(--bg)]", "wizard-in")}
      data-testid="manual-batch"
    >
      <div
        data-app-chrome
        className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 pb-3 pt-[calc(12px+var(--safe-top))] sm:px-6"
      >
        <span className="accent-tint grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)]">
          <ClipboardList className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">Через ChatGPT вручную</div>
          <div className="truncate text-[12px] text-[var(--text-faint)]">Часть за частью: промпт → ответ → проверка</div>
        </div>
        <button
          type="button"
          onClick={() => void requestClose()}
          aria-label="Закрыть — вставленное сохранится"
          title="Закрыть — вставленное сохранится"
          className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[880px] px-4 py-5 pb-[calc(20px+var(--safe-bottom))] sm:px-6">
          <Body m={m} onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
