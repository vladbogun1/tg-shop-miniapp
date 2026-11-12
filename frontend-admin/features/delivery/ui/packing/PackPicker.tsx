"use client";

/**
 * Выбор коробки упаковщиком: чипы коробок «в наличии» со значками (переносятся, без горизонтальной прокрутки),
 * под выбранной — её высоты по линиям сгиба; «Своя…» — Д×Ш×В, название и «сохранить в мои коробки».
 */
import { Input } from "@/components/ui/Input";
import { cm, isBagBox, type PackChoice } from "../../model/packing";
import type { NpBox } from "../../model/types";
import { Chip } from "../parts";
import { BoxGlyph } from "../boxes/BoxGlyph";

type Custom = Extract<PackChoice, { kind: "custom" }>;
const EMPTY_CUSTOM: Custom = { kind: "custom", name: "", l: "", w: "", h: "", save: false };

function Heights({ box, choice, onChoice }: { box: NpBox; choice: PackChoice; onChoice: (c: PackChoice) => void }) {
  if (isBagBox(box) || box.options.length <= 1) return null;
  const current = choice.kind === "box" ? choice.heightMm : null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="field-label !text-[11px]">Высота</span>
      {box.options.map((o) => (
        <Chip key={o.heightMm} active={current === o.heightMm} onClick={() => onChoice({ kind: "box", boxId: box.id, heightMm: o.heightMm })}>
          <span className="tabular">
            {cm(o.heightMm)} см{o.full ? " · полная" : ""}
          </span>
        </Chip>
      ))}
    </div>
  );
}

function CustomFields({ c, onChoice }: { c: Custom; onChoice: (c: PackChoice) => void }) {
  const set = (patch: Partial<Custom>) => onChoice({ ...c, ...patch });
  return (
    <div className="card-2 flex min-w-0 flex-col gap-2.5 p-3">
      <div className="min-w-0">
        <div className="field-label mb-1.5">Своя коробка, см (Д × Ш × В)</div>
        <div className="grid grid-cols-3 gap-2">
          <Input aria-label="Длина, см" inputMode="decimal" placeholder="Д" value={c.l} onChange={(e) => set({ l: e.target.value })} />
          <Input aria-label="Ширина, см" inputMode="decimal" placeholder="Ш" value={c.w} onChange={(e) => set({ w: e.target.value })} />
          <Input aria-label="Высота, см" inputMode="decimal" placeholder="В" value={c.h} onChange={(e) => set({ h: e.target.value })} />
        </div>
      </div>
      <Input aria-label="Название" placeholder="Название (необязательно)" value={c.name} onChange={(e) => set({ name: e.target.value })} />
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text)] pointer-coarse:min-h-11">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={c.save} onChange={(e) => set({ save: e.target.checked })} />
        Сохранить в мои коробки
      </label>
    </div>
  );
}

export function PackPicker({
  boxes,
  choice,
  onChoice,
}: {
  /** Коробки в наличии. */
  boxes: NpBox[];
  choice: PackChoice | null;
  onChoice: (c: PackChoice) => void;
}) {
  const selected = choice?.kind === "box" ? boxes.find((b) => b.id === choice.boxId) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {boxes.map((b) => (
          <Chip
            key={b.id}
            active={selected?.id === b.id}
            onClick={() => onChoice({ kind: "box", boxId: b.id, heightMm: isBagBox(b) ? null : (b.heightsMm[0] ?? null) })}
          >
            <span className="inline-flex items-center gap-1.5">
              <BoxGlyph box={b} size={20} className="shrink-0" />
              {b.name}
            </span>
          </Chip>
        ))}
        <Chip active={choice?.kind === "custom"} onClick={() => onChoice(choice?.kind === "custom" ? choice : EMPTY_CUSTOM)}>
          Своя…
        </Chip>
      </div>
      {selected && choice && <Heights box={selected} choice={choice} onChoice={onChoice} />}
      {choice?.kind === "custom" && <CustomFields c={choice} onChoice={onChoice} />}
    </div>
  );
}
