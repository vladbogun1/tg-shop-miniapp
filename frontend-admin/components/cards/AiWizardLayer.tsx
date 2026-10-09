"use client";

/**
 * Full-screen layer over «Карточки» with the batch wizard «Оформить с ИИ» (AiCards). It stays
 * mounted once opened: closing only hides it, so a copied prompt / pasted answer survive a look at
 * the list. Plain CSS animation on purpose — not a Modal: the wizard has SegmentedControls with
 * layout animations, which left Modal exits unfinished (see globals.css, «.tab-in»).
 */
import { Sparkles, X } from "lucide-react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { CardItem, CardSchema } from "@/lib/card-prompt";
import { cn } from "@/lib/cn";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { AiCards } from "@/components/cards/AiCards";

export function AiWizardLayer({
  open,
  onClose,
  items,
  schema,
  ids,
  preselect,
  preselectLabel,
}: {
  open: boolean;
  onClose: () => void;
  items: CardItem[];
  schema: CardSchema;
  ids: Map<string, string>;
  preselect: string[];
  preselectLabel?: string;
}) {
  useOverlayLayer(open, onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Оформить с ИИ"
      hidden={!open}
      // The wizard's sticky save bar sits at the very bottom here (no tab bar under this layer).
      style={{ "--bottom-nav": "0px" } as CSSProperties}
      className={cn("fixed inset-0 z-[110] flex flex-col bg-[var(--bg)]", open && "wizard-in")}
    >
      <div
        data-app-chrome
        className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 pb-3 pt-[calc(12px+var(--safe-top))] sm:px-6"
      >
        <span className="accent-tint grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)]">
          <Sparkles className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">Оформить с ИИ</div>
          <div className="truncate text-[12px] text-[var(--text-faint)]">Промпт → ответ ИИ с поиском в интернете → проверка → сохранение</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть (Esc) — вставленный ответ сохранится"
          title="Закрыть (Esc) — вставленный ответ сохранится"
          className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-5 pb-[calc(20px+var(--safe-bottom))] sm:px-6">
          <AiCards items={items} schema={schema} ids={ids} preselect={preselect} preselectLabel={preselectLabel} />
        </div>
      </div>
    </div>,
    document.body
  );
}
