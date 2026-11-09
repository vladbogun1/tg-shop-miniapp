"use client";

/** Общие части карточек экрана проверки: оболочка со статусом, строка документа, окружение (что нужно карточкам от экрана). */
import { AlertTriangle, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import type { SupplyDraft } from "../../api-drafts";
import { round2 } from "../../model/ai/checks";
import type { ReviewRow } from "../../model/ai/types";
import { fmtDoc, type ReviewCtx } from "./review";
import type { DraftEdit } from "./use-draft-edit";

/** Всё, что нужно карточкам от экрана: правки, решения, каталог. */
export interface ReviewEnv {
  draft: SupplyDraft;
  edit: DraftEdit;
  ctx: ReviewCtx;
  currency: string;
  /** Открыть выбор товара каталога для строки. */
  pick: (lineId: string) => void;
}

export type CardState = "ok" | "todo" | "skip";

const BORDER: Record<CardState, string> = {
  ok: "border-l-[var(--ok)]",
  todo: "border-l-[var(--warn)]",
  skip: "border-l-[var(--line-strong)] opacity-70",
};

export function StateChip({ state }: { state: CardState }) {
  if (state === "skip") return <Badge>пропущена</Badge>;
  return state === "ok" ? (
    <Badge tone="ok">
      <Check className="h-3 w-3" /> готово
    </Badge>
  ) : (
    <Badge tone="warn">
      <AlertTriangle className="h-3 w-3" /> нужно решить
    </Badge>
  );
}

export function CardShell({ id, state, children }: { id: string; state: CardState; children: ReactNode }) {
  return (
    <div id={id} className={cn("card min-w-0 scroll-mt-24 border-l-[3px] p-3.5 transition-shadow", BORDER[state])}>
      {children}
    </div>
  );
}

/** Строка документа: что в накладной — текст, вариант, перевод, количество × цена. */
export function DocLine({ r, env, issue }: { r: ReviewRow; env: ReviewEnv; issue?: string | null }) {
  const l = r.line;
  const sum = l.unitPrice != null ? round2(l.unitPrice * l.qty) : null;
  const arithmetic = env.edit.review.lineIssue(l);
  const note = env.draft.lineNotes[l.id];
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[11px] text-[var(--text-faint)]">{l.id}</span>
        <span className="min-w-0 break-words text-[14px] font-semibold text-[var(--text)]">{l.text}</span>
      </div>
      {(l.variant || l.en) && <div className="mt-0.5 break-words text-[12.5px] text-[var(--text-muted)]">{[l.variant, l.en].filter(Boolean).join(" · ")}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] tabular-nums text-[var(--text-muted)]">
        <span>
          {l.qty} шт. × {l.unitPrice != null ? fmtDoc(l.unitPrice, env.currency) : "цена не указана"}
          {sum != null && ` = ${fmtDoc(sum, env.currency)}`}
        </span>
        {env.edit.review.repeats.has(l.id) && r.decision.kind !== "skip" && <Badge tone="warn">похоже на повтор</Badge>}
      </div>
      {arithmetic && <div className="mt-1 text-[12.5px] text-[var(--warn)]">⚠ {arithmetic}</div>}
      {l.notes && <div className="mt-1 text-[12.5px] text-[var(--warn)]">{l.notes}</div>}
      {note && <div className="mt-1 break-words text-[12.5px] text-[var(--text-muted)]">ИИ: {note}</div>}
      {issue && <div className="mt-1 text-[12.5px] font-semibold text-[var(--warn)]">{issue}</div>}
    </div>
  );
}
