"use client";

/** Small pieces shared by the «Карточки» screen. */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { confidenceColor, type CardIssue } from "@/lib/card-check";
import type { CardStatusCode } from "@/lib/card-prompt";
import { Image } from "@/lib/image";

export function Step({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card mb-5 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="accent-tint font-display tabular grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] text-[14px] font-bold">
          {n}
        </span>
        <h2 className="section-title !text-[15px] text-[var(--ink)]">{title}</h2>
        {aside && <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Coloured dot of a field confidence (title = the number). */
export function ConfidenceDot({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span
      aria-label={value == null ? "уверенность не указана" : `уверенность ${value} %`}
      title={value == null ? "уверенность не указана" : `уверенность ${value} %`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: confidenceColor(value) }}
    />
  );
}

/** Tinted pill "92 %" in the confidence colour. */
export function ConfidencePill({ value, label }: { value: number | null | undefined; label?: string }) {
  return (
    <span
      className="chip-tint tabular !gap-1 !px-2 !text-[11px] !leading-[18px]"
      style={{ "--chip": confidenceColor(value) } as CSSProperties}
      title="Общая уверенность ИИ"
    >
      {label ? `${label} ` : ""}
      {value == null ? "—" : `${value} %`}
    </span>
  );
}

const STATUS: Record<string, { label: string; color: string; cls?: string }> = {
  DRAFT: { label: "черновик", color: "var(--text-muted)", cls: "!bg-[var(--surface-3)]" },
  AI_FILLED: { label: "от ИИ", color: "var(--info)" },
  READY: { label: "проверена", color: "var(--ok)" },
};

export function CardStatusChip({ status }: { status: CardStatusCode | string | null | undefined }) {
  const s = STATUS[String(status ?? "DRAFT")] ?? STATUS.DRAFT;
  return (
    <span className={cn("chip-tint !px-2 !text-[10px] !leading-[16px]", s.cls)} style={{ "--chip": s.color } as CSSProperties}>
      {s.label}
    </span>
  );
}

export function Thumb({ src, alt, size = 44 }: { src?: string | null; alt: string; size?: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]" style={{ width: size, height: size }}>
      <Image src={src ?? null} alt={alt} size={size * 2} className="h-full w-full" />
    </div>
  );
}

export function CardIssues({ issues, hideInfo = false }: { issues: CardIssue[]; hideInfo?: boolean }) {
  const list = issues.filter((i) => i.text && (!hideInfo || i.level !== "info"));
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {list.map((i, k) => (
        <li
          key={k}
          className={cn(
            "text-[12px] font-semibold leading-snug",
            i.level === "error"
              ? "text-[var(--danger-ink)]"
              : i.level === "warn"
                ? "text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]"
                : "text-[var(--text-faint)]"
          )}
        >
          {i.level === "error" ? "✕ " : i.level === "warn" ? "! " : "ℹ "}
          {i.text}
        </li>
      ))}
    </ul>
  );
}

export function Check({
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      className={cn("h-4 w-4 shrink-0 accent-[var(--accent)]", disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer", className)}
      checked={checked && !disabled}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function fmtDate(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
