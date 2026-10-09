"use client";

/** Small catalog v2 marks: card status chip, AI confidence dot, condition chip. */
import type { CSSProperties } from "react";
import type { CardStatus, ProductCondition } from "@shop/shared";
import { CARD_STATUS_LABEL, CONDITION_LABEL, confidenceColor } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";

const STATUS_HUE: Record<CardStatus, string> = {
  DRAFT: "var(--text-muted)",
  AI_FILLED: "var(--info)",
  READY: "var(--ok)",
};

/** «Черновик» / «От ИИ · 82 %» / «Проверена»; `incomplete` adds an amber «неполная». */
export function CardStatusBadge({
  status,
  confidence,
  incomplete,
  className,
  compact,
}: {
  status: CardStatus | undefined;
  confidence?: number | null;
  incomplete?: number;
  className?: string;
  compact?: boolean;
}) {
  const s = status ?? "DRAFT";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <span
        className={cn("chip-tint", s === "DRAFT" && "!bg-[var(--surface-3)]")}
        style={{ "--chip": STATUS_HUE[s] } as CSSProperties}
        title={s === "DRAFT" ? "Карточка не оформлена: черновик не выкладывается на витрину без явного «Выложить без оформления»" : "Статус оформления карточки"}
      >
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        {CARD_STATUS_LABEL[s]}
        {s === "AI_FILLED" && confidence != null && !compact && <span className="tabular opacity-80" title="Насколько ИИ уверена в карточке в целом">· ИИ {confidence} %</span>}
      </span>
      {!!incomplete && incomplete > 0 && (
        <span
          className="chip-tint"
          style={{ "--chip": "var(--warn)" } as CSSProperties}
          title={`Не заполнено обязательных характеристик: ${incomplete}`}
        >
          неполная{compact ? "" : ` · ${incomplete}`}
        </span>
      )}
    </span>
  );
}

export function ConditionBadge({ condition, className }: { condition?: ProductCondition; className?: string }) {
  if (!condition || condition === "NEW") return null;
  return (
    <span
      className={cn("chip-tint", className)}
      style={{ "--chip": condition === "MARKDOWN" ? "var(--accent-hi)" : "var(--warn)" } as CSSProperties}
    >
      {CONDITION_LABEL[condition]}
    </span>
  );
}

/** Coloured dot of the AI's confidence in one field; the tooltip names the source. */
export function ConfidenceDot({ c, src }: { c: number; src?: string | null }) {
  const label = `Уверенность ИИ: ${c} %${src ? ` · источник: ${src}` : ""}`;
  const dot = (
    <span
      aria-label={label}
      title={label}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: confidenceColor(c), boxShadow: `0 0 6px ${confidenceColor(c)}` }}
    />
  );
  if (!src) return dot;
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer noopener"
      title={label}
      className="focusable inline-flex items-center gap-1 rounded-[var(--r-sm)] text-[11px] tabular text-[var(--text-faint)] hover:text-[var(--text)]"
    >
      {dot}
      {c}%
    </a>
  );
}
