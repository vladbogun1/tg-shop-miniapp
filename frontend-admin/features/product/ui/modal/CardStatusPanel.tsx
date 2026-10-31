"use client";

import { ExternalLink, RotateCcw, ShieldCheck, Wand2 } from "lucide-react";
import type { CardStatus } from "@shop/core/catalog";
import { Button } from "@shop/ui/admin-button";
import { CardStatusBadge } from "@/features/catalog";

export function CardStatusPanel({
  status,
  confidence,
  missing,
  sources,
  notes,
  busy,
  onReady,
  onDraft,
  onAi,
  dirty,
}: {
  status: CardStatus;
  confidence?: number | null;
  missing: number;
  sources: string[];
  notes?: string | null;
  busy: boolean;
  onReady: () => void;
  onDraft: () => void;
  onAi?: () => void;
  dirty: boolean;
}) {
  return (
    <div className="mt-1 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="field-label !text-[10.5px] !text-[var(--text-faint)]">Карточка</span>
          <CardStatusBadge status={status} confidence={confidence} incomplete={missing} />
        </div>
        <div className="flex flex-wrap gap-2">
          {onAi && status !== "READY" && (
            <Button size="sm" variant="outline" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={onAi} disabled={busy || dirty} title={dirty ? "Сначала сохраните изменения" : undefined}>
              Оформить с ИИ
            </Button>
          )}
          {status === "READY" ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={busy} onClick={onDraft}>
              Вернуть в черновик
            </Button>
          ) : (
            <Button size="sm" variant="surface" icon={<ShieldCheck className="h-3.5 w-3.5" />} loading={busy} onClick={onReady}>
              Отметить проверенной
            </Button>
          )}
        </div>
      </div>
      {status !== "READY" && missing > 0 && (
        <p className="mt-2 text-[12px] text-[var(--text-faint)]">Можно отметить и неполную — в «Карточки → Готово» её покажет фильтр «только неполные».</p>
      )}
      {(sources.length > 0 || notes) && (
        <div className="mt-3 border-t border-[var(--line)] pt-2.5 text-[12px] text-[var(--text-muted)]">
          {notes && <p className="mb-1.5 leading-snug">Заметка ИИ: {notes}</p>}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {sources.slice(0, 6).map((s) => (
                <a key={s} href={s} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-[260px] items-center gap-1 truncate text-[var(--text-faint)] hover:text-[var(--accent-hi)]">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{s.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">Черновик не выкладывается на витрину без явного «Выложить без оформления»; «от ИИ» и «проверена» — выкладываются. Меняется сразу.</p>
    </div>
  );
}
