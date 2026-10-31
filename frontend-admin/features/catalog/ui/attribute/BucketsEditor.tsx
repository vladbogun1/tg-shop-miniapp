"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { autoBucketLabel, parseNum, uid, type BucketRow, type Draft } from "../../model/attribute-draft";
import { AddLink, CELL, Errors, RemoveBtn, SectionTitle } from "./parts";

/** Диапазоны фильтра числовой характеристики («до 45 г», «45–54 г»…). */
export function BucketsEditor({
  d,
  errors,
  setD,
}: {
  d: Draft;
  errors: string[];
  setD: (f: (p: Draft) => Draft) => void;
}) {
  return (
  <section className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <SectionTitle>Диапазоны фильтра</SectionTitle>
      <AddLink
        onClick={() =>
          setD((p) => ({
            ...p,
            buckets: [...p.buckets, { uid: uid(), min: "", max: "", labelRu: "", labelUk: "", labelEn: "" }],
          }))
        }
      >
        Диапазон
      </AddLink>
    </div>
    {d.buckets.length === 0 ? (
      <p className="text-[12.5px] text-[var(--text-faint)]">
        Без диапазонов фильтр — два поля «от–до». С диапазонами — чипы «до 45 г», «45–54 г»… Границы включительно.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        <div aria-hidden className="field-label hidden grid-cols-[72px_72px_1fr_1fr_1fr_36px] gap-2 !text-[10.5px] !text-[var(--text-faint)] sm:grid">
          <span>от</span>
          <span>до</span>
          <span>подпись RU</span>
          <span>UK</span>
          <span>EN</span>
          <span />
        </div>
        {d.buckets.map((b, i) => {
          const min = parseNum(b.min);
          const max = parseNum(b.max);
          const okNums = !Number.isNaN(min) && !Number.isNaN(max);
          const upd = (patch: Partial<BucketRow>) =>
            setD((p) => ({ ...p, buckets: p.buckets.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
          return (
            <motion.div
              layout
              key={b.uid}
              className="grid grid-cols-[1fr_1fr_36px] gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-2 sm:grid-cols-[72px_72px_1fr_1fr_1fr_36px] sm:border-0 sm:p-0"
            >
              <input className={cn(CELL, "tabular")} inputMode="decimal" aria-label="от" placeholder="от" value={b.min} onChange={(e) => upd({ min: e.target.value })} />
              <input className={cn(CELL, "tabular")} inputMode="decimal" aria-label="до" placeholder="до" value={b.max} onChange={(e) => upd({ max: e.target.value })} />
              <RemoveBtn label="Удалить диапазон" onClick={() => setD((p) => ({ ...p, buckets: p.buckets.filter((_, j) => j !== i) }))} className="sm:order-last" />
              {(["labelRu", "labelUk", "labelEn"] as const).map((k, li) => (
                <input
                  key={k}
                  className={cn(CELL, "col-span-3 sm:col-span-1")}
                  aria-label={`подпись ${["RU", "UK", "EN"][li]}`}
                  value={b[k]}
                  placeholder={okNums ? autoBucketLabel(min, max, li === 2 ? d.unitEn : li === 1 ? d.unitUk || d.unitRu : d.unitRu, (["ru", "uk", "en"] as const)[li]) || ["RU", "UK", "EN"][li] : ""}
                  onChange={(e) => upd({ [k]: e.target.value } as Partial<BucketRow>)}
                />
              ))}
            </motion.div>
          );
        })}
        <p className="text-[12px] text-[var(--text-faint)]">Пустая подпись — подставится по границам (как в подсказке).</p>
      </div>
    )}
    <Errors list={errors} />
  </section>
  );
}
