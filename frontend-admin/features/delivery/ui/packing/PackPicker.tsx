"use client";

/**
 * Выбор коробки упаковщиком: чипы коробок «в наличии» со значками (переносятся, без горизонтальной прокрутки),
 * под выбранной — её высоты по линиям сгиба; «Своя коробка…» — Д×Ш×В, «Свой пакет…» — Д×Ш (толщина по товару),
 * название и «сохранить в мои коробки».
 * В поштомат: коробки и высоты, которые не влезают в ячейку 60×40×30, выключены с подписью; пакет сервер сложит.
 */
import { Input } from "@/components/ui/Input";
import { toMm } from "../../model/format";
import { boxFitsPostomat, cm, fitsPostomat, isBagBox, type PackChoice } from "../../model/packing";
import type { NpBox } from "../../model/types";
import { Chip } from "../parts";
import { BoxGlyph } from "../boxes/BoxGlyph";

type Custom = Extract<PackChoice, { kind: "custom" }>;
const EMPTY_CUSTOM: Custom = { kind: "custom", name: "", l: "", w: "", h: "", save: false };
const EMPTY_BAG: Custom = { ...EMPTY_CUSTOM, bag: true };

function Heights({ box, choice, postomat, onChoice }: { box: NpBox; choice: PackChoice; postomat: boolean; onChoice: (c: PackChoice) => void }) {
  if (isBagBox(box) || box.options.length <= 1) return null;
  const current = choice.kind === "box" ? choice.heightMm : null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="field-label !text-[11px]">Высота</span>
      {box.options.map((o) => (
        <Chip
          key={o.heightMm}
          active={current === o.heightMm}
          disabled={postomat && !boxFitsPostomat(box, o.heightMm)}
          onClick={() => onChoice({ kind: "box", boxId: box.id, heightMm: o.heightMm })}
        >
          <span className="tabular">
            {cm(o.heightMm)} см{o.full ? " · полная" : ""}
          </span>
        </Chip>
      ))}
    </div>
  );
}

function customTitle(c: Custom, thickness: boolean): string {
  if (!c.bag) return "Своя коробка, см (Д × Ш × В)";
  return thickness ? "Свой пакет или стрейч, см (Д × Ш × толщина)" : "Свой пакет, см (Д × Ш) — толщина по товару";
}

function CustomFields({ c, postomat, thickness, onChoice }: { c: Custom; postomat: boolean; thickness: boolean; onChoice: (c: PackChoice) => void }) {
  const set = (patch: Partial<Custom>) => onChoice({ ...c, ...patch });
  const [l, w, h] = [toMm(c.l), toMm(c.w), toMm(c.h)];
  // Пакет сервер сложит до ячейки поштомата сам; коробка — нет.
  const tooBig = postomat && !c.bag && !!l && !!w && !!h && !fitsPostomat(l, w, h);
  const third = !c.bag || thickness;
  return (
    <div className="card-2 flex min-w-0 flex-col gap-2.5 p-3">
      <div className="min-w-0">
        <div className="field-label mb-1.5">{customTitle(c, thickness)}</div>
        <div className={third ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
          <Input aria-label="Длина, см" inputMode="decimal" placeholder="Д" value={c.l} onChange={(e) => set({ l: e.target.value })} />
          <Input aria-label="Ширина, см" inputMode="decimal" placeholder="Ш" value={c.w} onChange={(e) => set({ w: e.target.value })} />
          {third && (
            <Input
              aria-label={c.bag ? "Толщина, см" : "Высота, см"}
              inputMode="decimal"
              placeholder={c.bag ? "Т" : "В"}
              value={c.h}
              onChange={(e) => set({ h: e.target.value })}
            />
          )}
        </div>
      </div>
      {tooBig && <p className="text-[12.5px] font-semibold text-[var(--danger)]">Больше 60×40×30 см — в поштомат не влезет</p>}
      <Input aria-label="Название" placeholder="Название (необязательно)" value={c.name} onChange={(e) => set({ name: e.target.value })} />
      {/* Места из нескольких в «Мои коробки» не сохраняются — галки там нет. */}
      {!thickness && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text)] pointer-coarse:min-h-11">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={c.save} onChange={(e) => set({ save: e.target.checked })} />
          Сохранить в мои коробки
        </label>
      )}
    </div>
  );
}

export function PackPicker({
  boxes,
  choice,
  postomat = false,
  thickness = false,
  onChoice,
}: {
  /** Коробки в наличии. */
  boxes: NpBox[];
  choice: PackChoice | null;
  /** Посылка в поштомат: не влезающие в ячейку коробки выключены. */
  postomat?: boolean;
  /** Место из нескольких: у своего пакета вписывается толщина. */
  thickness?: boolean;
  onChoice: (c: PackChoice) => void;
}) {
  const selected = choice?.kind === "box" ? boxes.find((b) => b.id === choice.boxId) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {boxes.map((b) => {
          const fits = !postomat || boxFitsPostomat(b);
          // В поштомат — первая влезающая высота (у коробки 10 кг полная 28,5 см, а влезают 20/14/8,5).
          const height = isBagBox(b) ? null : (b.heightsMm.find((h) => !postomat || boxFitsPostomat(b, h)) ?? b.heightsMm[0] ?? null);
          return (
            <Chip key={b.id} active={selected?.id === b.id} disabled={!fits} onClick={() => onChoice({ kind: "box", boxId: b.id, heightMm: height })}>
              <span className="inline-flex items-center gap-1.5">
                <BoxGlyph box={b} size={20} className="shrink-0" />
                {b.name}
                {!fits && <span className="font-normal"> · не влезет в поштомат</span>}
              </span>
            </Chip>
          );
        })}
        <Chip active={choice?.kind === "custom" && !choice.bag} onClick={() => onChoice(choice?.kind === "custom" && !choice.bag ? choice : EMPTY_CUSTOM)}>
          Своя коробка…
        </Chip>
        <Chip active={choice?.kind === "custom" && !!choice.bag} onClick={() => onChoice(choice?.kind === "custom" && choice.bag ? choice : EMPTY_BAG)}>
          Свой пакет…
        </Chip>
      </div>
      {selected && choice && <Heights box={selected} choice={choice} postomat={postomat} onChoice={onChoice} />}
      {choice?.kind === "custom" && <CustomFields c={choice} postomat={postomat} thickness={thickness} onChoice={onChoice} />}
    </div>
  );
}
