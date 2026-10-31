"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ProductVariant } from "@shop/core/types";
import { cn } from "@/lib/cn";

const CELL =
  "h-10 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]";

export function Variants({ variants, onChange }: { variants: ProductVariant[]; onChange: (v: ProductVariant[]) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label">Варианты</span>
        <button
          type="button"
          onClick={() => onChange([...variants, { name: "", stock: 0 } as ProductVariant])}
          className="hit focusable font-display flex items-center gap-1 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] transition-colors hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Добавить
        </button>
      </div>
      {variants.length === 0 ? (
        <p className="text-[13px] text-[var(--text-faint)]">
          Без вариантов остаток задаётся вручную. Добавьте варианты (напр. цвет/размер), если нужен отдельный учёт.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div aria-hidden className="field-label flex gap-2 !text-[10.5px] !text-[var(--text-faint)]">
            <span className="min-w-0 flex-1 pl-0.5">Название</span>
            <span className="w-20 pl-0.5">Остаток</span>
            <span className="w-10 shrink-0" />
          </div>
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={v.name}
                placeholder="Название"
                aria-label={`Вариант ${i + 1}: название`}
                onChange={(e) => onChange(variants.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                className={cn(CELL, "min-w-0 flex-1")}
              />
              <input
                value={v.stock}
                inputMode="numeric"
                placeholder="0"
                aria-label={`Вариант ${i + 1}: остаток`}
                onChange={(e) => onChange(variants.map((p, j) => (j === i ? { ...p, stock: Number(e.target.value) || 0 } : p)))}
                className={cn(CELL, "tabular w-20")}
              />
              <button
                type="button"
                onClick={() => onChange(variants.filter((_, j) => j !== i))}
                className="nb-press focusable grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
                aria-label="Удалить вариант"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
