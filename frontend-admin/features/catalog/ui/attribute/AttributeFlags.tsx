"use client";

import { Toggle } from "@/components/ui/Toggle";
import type { Draft } from "../../model/attribute-draft";
import { FlagCard, FlagHint, SectionTitle } from "./parts";

/** Где используется: фильтр, сравнение, обязательность, строка-сводка карточки. */
export function AttributeFlags({
  d,
  highlightOthers,
  set,
}: {
  d: Draft;
  highlightOthers: number;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const highlightOver = d.highlight && highlightOthers >= 3;
  return (
  <section className="flex flex-col gap-3">
    <SectionTitle>Где используется</SectionTitle>
    <div className="grid gap-2 sm:grid-cols-2">
      <FlagCard>
        <Toggle
          checked={d.type !== "text" && d.filterable}
          disabled={d.type === "text"}
          onChange={(v) => set("filterable", v)}
          label="Фильтр на витрине"
        />
        <FlagHint>Фасет в «Фильтрах» Mini App и сайта.</FlagHint>
      </FlagCard>
      <FlagCard>
        <Toggle checked={d.comparable} onChange={(v) => set("comparable", v)} label="Для сравнения" />
        <FlagHint>Попадёт в будущее сравнение товаров.</FlagHint>
      </FlagCard>
      <FlagCard>
        <Toggle checked={d.required} onChange={(v) => set("required", v)} label="Обязательная" />
        <FlagHint>Без неё карточка считается «неполной».</FlagHint>
      </FlagCard>
      <FlagCard warn={highlightOver}>
        <Toggle checked={d.highlight} onChange={(v) => set("highlight", v)} label="На карточке товара" />
        <FlagHint>
          {highlightOver
            ? `Уже ${highlightOthers} в этой категории — в строку-сводку попадут только первые 3.`
            : "Строка-сводка в сетке: «51 г · PAW3950 · 8000 Гц» (до 3)."}
        </FlagHint>
      </FlagCard>
    </div>
  </section>
  );
}
