"use client";

/** Четыре поля с подписями: вес (г) и длина × ширина × высота (см). На телефоне — 2×2, шире — в строку. */
import { Input } from "@/components/ui/Input";
import { cleanCm, cleanWeight, type SizeForm } from "../../model/size-form";

const FIELDS: { key: keyof SizeForm; label: string; decimal: boolean }[] = [
  { key: "weight", label: "Вес, г", decimal: false },
  { key: "l", label: "Длина, см", decimal: true },
  { key: "w", label: "Ширина, см", decimal: true },
  { key: "h", label: "Высота, см", decimal: true },
];

export function SizeInputs({ form, onChange, idPrefix }: { form: SizeForm; onChange: (f: SizeForm) => void; idPrefix?: string }) {
  const p = idPrefix ? `${idPrefix}: ` : "";
  return (
    <div className="grid min-w-0 flex-[2] basis-72 grid-cols-2 gap-2 sm:grid-cols-4">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex min-w-0 flex-col gap-1">
          <span className="font-display truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{f.label}</span>
          <Input
            aria-label={`${p}${f.label.toLowerCase()}`}
            placeholder="—"
            inputMode={f.decimal ? "decimal" : "numeric"}
            value={form[f.key]}
            onChange={(e) => onChange({ ...form, [f.key]: f.decimal ? cleanCm(e.target.value) : cleanWeight(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
