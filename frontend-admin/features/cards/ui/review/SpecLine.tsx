"use client";

import { ArrowRight, Link2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatValue } from "../../model";
import type { SpecRow } from "../../model/review-edit";
import { ConfidenceDot } from "../shared";
import { EditedMark } from "./parts";

/** Значение: «было → стало» (или «удалено»), «не заполнено» либо текущее. */
function SpecValue({ r }: { r: SpecRow }) {
  if (r.change) {
    const removed = r.change.after === undefined || r.change.after === null;
    return (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="text-[var(--text-faint)] line-through decoration-[var(--text-faint)]">{formatValue(r.attr, r.change.before)}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-faint)]" />
        <b className={removed ? "font-semibold text-[var(--danger-ink)]" : "font-semibold text-[var(--text)]"}>{removed ? "удалено" : formatValue(r.attr, r.change.after)}</b>
      </span>
    );
  }
  if (r.missing) return <span className="font-semibold text-[color-mix(in_srgb,var(--warn)_85%,var(--text))]">не заполнено</span>;
  return <span className="text-[var(--text-muted)]">{formatValue(r.attr, r.value)}</span>;
}

const confidenceColor = (c: number) => (c < 40 ? "var(--danger-ink)" : c < 60 ? "var(--warn)" : "var(--text-muted)");

/** Уверенность ИИ и ссылка на источник значения. */
function SpecEvidence({ r }: { r: SpecRow }) {
  return (
    <span className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-1.5 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
      {r.confidence != null && (
        <span
          className="tabular whitespace-nowrap text-[11.5px] font-semibold"
          style={{ color: confidenceColor(r.confidence) }}
          title={`ИИ уверена в этом значении на ${r.confidence} %`}
        >
          ИИ {r.confidence} %
        </span>
      )}
      {r.src && (
        <a
          href={r.src}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`Источник: ${r.src}`}
          aria-label={`Источник значения «${r.label}»`}
          className="focusable grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--info)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <Link2 className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

export function SpecLine({ r }: { r: SpecRow }) {
  const changed = !!r.change;
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-[var(--line)] px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(150px,1.1fr)_minmax(0,1.6fr)_104px]",
        r.missing && !changed && "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)]"
      )}
    >
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
      <ConfidenceDot value={changed || r.confidence != null ? r.confidence : undefined} />
      <span className="truncate" title={r.key}>
        {r.label}
      </span>
      {r.attr?.required && (
        <span className="text-[11px] text-[var(--accent-hi)]" title="Обязательная для полной карточки">
          *
        </span>
      )}
      {r.change?.edited && <EditedMark />}
    </span>
      <span className="col-start-1 row-start-2 min-w-0 text-[13px] sm:col-start-auto sm:row-start-auto">
        <SpecValue r={r} />
      </span>
      <SpecEvidence r={r} />
    </div>
  );
}
