"use client";

/**
 * Слой ручного пакета поверх любой страницы: части → проверка. Пакет и черновик живут на сервере, поэтому закрыть
 * можно в любой момент и продолжить на другом устройстве; если что-то вставлено, спрашиваем по макету:
 * «Выйти, сохранив вставленное?». Пустой пакет при закрытии удаляется — висеть «Продолжить» ему незачем.
 */
import { CenterSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useConfirm } from "@shop/ui/confirm";
import { useOverlayLayer } from "@shop/ui/overlay";
import { ClipboardList, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { progressText } from "../../model/manual-batch";
import { closeManualLayer, useManualLayer } from "./manual-layer";
import { ManualPartStep } from "./ManualPartStep";
import { ManualReviewStage } from "./ManualReviewStage";
import { useManualBatch, type ManualBatchState } from "./use-manual-batch";

/** Вставлено или решено ли хоть что-то, что жалко потерять. */
const hasWork = (m: ManualBatchState) =>
  !!m.draft && (m.draft.answers.some((a) => a.trim()) || (m.batch?.batch.jobs.length ?? 0) > 0);

function Body({ m, onClose, onEdit }: { m: ManualBatchState; onClose: () => void; onEdit: (jobId: number) => void }) {
  if (m.loading) return <CenterSpinner label="Загрузка карточек…" />;
  if (!m.batch || !m.draft) return <p className="text-[13px] text-[var(--text-muted)]">Незаконченного ручного пакета нет — выберите товары и начните заново.</p>;
  return m.draft.stage === "review" ? <ManualReviewStage m={m} onClose={onClose} onEdit={onEdit} /> : <ManualPartStep m={m} />;
}

function Header({ onClose }: { onClose: () => void }) {
  return (
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
        onClick={onClose}
        aria-label="Закрыть — вставленное сохранится"
        title="Закрыть — вставленное сохранится"
        className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function Layer({ open }: { open: boolean }) {
  const m = useManualBatch(open);
  const confirm = useConfirm();
  const router = useRouter();

  async function requestClose() {
    if (!hasWork(m)) {
      if (m.batch) await m.discard();
      closeManualLayer();
      return;
    }
    const d = m.draft!;
    const ok = await confirm({
      title: "Выйти, сохранив вставленное?",
      message: `Пакет хранится на сервере — продолжить можно и с другого устройства: «${progressText(d, m.current?.answered ?? 0, m.current?.size ?? 0)}».`,
      confirmLabel: "Сохранить и выйти",
      cancelLabel: "Остаться",
    });
    if (!ok) return;
    await m.save();
    closeManualLayer();
  }

  /** «Править»: обычный экран проверки задачи, как у пакета ИИ; вернуться к пакету — «Продолжить». */
  async function edit(jobId: number) {
    await m.save();
    closeManualLayer();
    router.push(`/cards/ai-review/${jobId}`);
  }

  async function finished() {
    if (await m.finish()) closeManualLayer();
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
      <Header onClose={() => void requestClose()} />
      <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[880px] px-4 py-5 pb-[calc(20px+var(--safe-bottom))] sm:px-6">
          <Body m={m} onClose={() => void finished()} onEdit={(id) => void edit(id)} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Слой рисует только первый смонтированный хозяин (см. `manual-layer`) и только открытым: карточки грузятся по делу. */
export function ManualBatchLayer() {
  const { open, owner } = useManualLayer();
  return owner && open ? <Layer open /> : null;
}
