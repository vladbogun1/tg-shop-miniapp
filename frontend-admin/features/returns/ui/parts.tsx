"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import type { ReturnOrderItem } from "../model/types";

type Item = ReturnOrderItem;

export function Thumb({ item, dim }: { item: Item; dim?: boolean }) {
  return (
    <Image
      src={item.imageUrl ?? undefined}
      alt={item.title}
      size={96}
      className={cn(
        "h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] transition-opacity",
        dim && "opacity-50",
      )}
    />
  );
}

export function SummaryRow({
  item,
  qty,
  text,
  gift,
  danger,
}: {
  item: Item;
  qty: number;
  text: string;
  gift?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="card-2 flex items-center gap-3 px-3 py-2">
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[var(--text)]">
          {gift && "🎁 "}
          {item.title} <span className="tabular text-[var(--text-muted)]">×{qty}</span>
        </div>
        <div className={cn("text-[12px]", danger ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]")}>
          {text}
        </div>
      </div>
    </div>
  );
}

export function ChoiceCard({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "nb-press flex min-h-12 items-center gap-2.5 rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{label}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] leading-tight opacity-80">{sub}</span>}
      </span>
    </button>
  );
}

export function Counter({
  label,
  value,
  min,
  max,
  onChange,
  lessLabel,
  moreLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** aria-label кнопок; по умолчанию — «<label>: меньше / больше». */
  lessLabel?: string;
  moreLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 text-[12.5px] text-[var(--text-muted)]">
      <span>{label}:</span>
      <StepBtn label={lessLabel ?? `${label}: меньше`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </StepBtn>
      <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{value}</span>
      <StepBtn label={moreLabel ?? `${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </StepBtn>
      <span>из {max}</span>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
