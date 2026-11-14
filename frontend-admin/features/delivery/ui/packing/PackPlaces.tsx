"use client";

/**
 * Посылка несколькими местами одной ТТН: коврик в стрейче отдельно, мышка в коробке. Первое место — выбор над этим
 * блоком; здесь — остальные, у каждого своя коробка (или свои размеры, у пакета — с толщиной) и вес.
 * Пустой вес — сервер делит вес товаров поровну и добавляет тару коробки.
 * В поштомат несколько мест не принимают — там блока нет.
 */
import { Plus, X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { weightText } from "../../model/format";
import type { PackChoice, PackPlace } from "../../model/packing";
import type { NpBox } from "../../model/types";
import { PackPicker } from "./PackPicker";

/** Вес места, г: только цифры, подсказка «1,2 кг». */
export function SeatWeight({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-36 min-w-0">
      <Input
        label={label}
        inputMode="numeric"
        placeholder="по товарам"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        hint={value ? weightText(Number(value)) : undefined}
      />
    </div>
  );
}

function Place({ n, place, boxes, onChange, onRemove }: { n: number; place: PackPlace; boxes: NpBox[]; onChange: (p: PackPlace) => void; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-[var(--line)] pt-2.5" aria-label={`Место ${n}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-[var(--text)]">Место {n}</span>
        <Button size="sm" variant="surface" className="pointer-coarse:min-h-11" icon={<X className="h-3.5 w-3.5" />} onClick={onRemove}>
          Убрать
        </Button>
      </div>
      <PackPicker boxes={boxes} choice={place.choice} thickness onChoice={(c: PackChoice) => onChange({ ...place, choice: c })} />
      <SeatWeight label={`Вес места ${n}, г`} value={place.weight} onChange={(weight) => onChange({ ...place, weight })} />
    </div>
  );
}

export function PackPlaces({ boxes, more, onChange }: { boxes: NpBox[]; more: PackPlace[]; onChange: (more: PackPlace[]) => void }) {
  const set = (i: number, p: PackPlace) => onChange(more.map((x, j) => (j === i ? p : x)));
  return (
    <>
      {more.map((p, i) => (
        <Place
          // Места не переставляются — индекс устойчив.
          key={i}
          n={i + 2}
          place={p}
          boxes={boxes}
          onChange={(x) => set(i, x)}
          onRemove={() => onChange(more.filter((_, j) => j !== i))}
        />
      ))}
      <div>
        <Button
          size="sm"
          variant="surface"
          className="pointer-coarse:min-h-11"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => onChange([...more, { choice: null, weight: "" }])}
        >
          {more.length ? "Ещё место" : "Второе место (отдельная коробка или пакет)"}
        </Button>
      </div>
    </>
  );
}
