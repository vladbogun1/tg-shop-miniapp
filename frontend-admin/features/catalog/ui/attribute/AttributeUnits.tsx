"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import type { Draft } from "../../model/attribute-draft";
import { FlagCard, FlagHint, SectionTitle } from "./parts";

/** Единицы и «диапазон от–до» — только для числовой характеристики. */
export function AttributeUnits({ d, set }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }) {
  return (
  <AnimatePresence initial={false}>
    {d.type === "number" && (
      <motion.section
        key="units"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="flex flex-col gap-3 overflow-hidden"
      >
        <SectionTitle>Единица</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="RU" value={d.unitRu} maxLength={24} onChange={(e) => set("unitRu", e.target.value)} placeholder="г" />
          <Input label="UK" value={d.unitUk} maxLength={24} onChange={(e) => set("unitUk", e.target.value)} placeholder="г" />
          <Input label="EN" value={d.unitEn} maxLength={24} onChange={(e) => set("unitEn", e.target.value)} placeholder="g" />
        </div>
        <FlagCard>
          <Toggle checked={d.range} onChange={(v) => set("range", v)} label="Диапазон «от–до»" />
          <FlagHint>Значение — два числа (DPI 50–30 000). Фильтр ищет пересечение диапазонов.</FlagHint>
        </FlagCard>
      </motion.section>
    )}
  </AnimatePresence>
  );
}
