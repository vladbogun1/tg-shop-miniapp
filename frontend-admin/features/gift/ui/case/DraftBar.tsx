"use client";

import { Rocket, Undo2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";

/** «Опубликовано» (with «сбросить черновик» when a no-op draft is left) or «Черновик · изменений: N» with the publish button. */
export function DraftBar({
  changed,
  hasDraft,
  total,
  busy,
  onDiscard,
  onPublish,
}: {
  changed: number;
  hasDraft: boolean;
  total: number;
  busy: boolean;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  if (!hasDraft || changed === 0) {
    return (
      <div className="mt-3 flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--text-faint)]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ok,#3ecf8e)]" aria-hidden />
        Опубликовано · призов: {total}
        {hasDraft && (
          <button type="button" className="focusable ml-1 underline-offset-2 hover:underline" onClick={onDiscard}>
            сбросить черновик
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="card-2 mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 !border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] px-3 py-2.5">
      <div className="min-w-0 text-[13px] leading-snug">
        <b className="text-[var(--ink)]">Черновик</b> · изменений: <span className="tabular">{changed}</span>
        <span className="block text-[12px] text-[var(--text-muted)]">Покупатели пока видят опубликованный кейс</span>
      </div>
      <div className="flex flex-1 justify-end gap-2 sm:flex-none">
        <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={busy} onClick={onDiscard}>
          Отменить
        </Button>
        <Button size="sm" variant="accent" icon={<Rocket className="h-4 w-4" />} loading={busy} onClick={onPublish}>
          Опубликовать
        </Button>
      </div>
    </div>
  );
}
