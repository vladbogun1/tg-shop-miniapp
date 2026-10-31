"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ProductCondition } from "@shop/core/catalog";
import { CONDITION_OPTIONS } from "@/features/catalog";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ProductCtx } from "../ctx";

export function ConditionBlock({ x }: { x: ProductCtx }) {
  const { f, set } = x;
  return (
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Состояние</span>
        <SegmentedControl<ProductCondition>
          className="self-start"
          options={CONDITION_OPTIONS}
          value={f.condition}
          onChange={(v) => set("condition", v)}
        />
        <AnimatePresence initial={false}>
          {f.condition !== "NEW" && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="pt-2">
                <Input
                  label={f.condition === "MARKDOWN" ? "Причина уценки" : "Состояние товара"}
                  value={f.conditionNote}
                  maxLength={255}
                  onChange={(e) => set("conditionNote", e.target.value)}
                  placeholder={f.condition === "MARKDOWN" ? "Вскрыта упаковка, полный комплект" : "Был в использовании 2 месяца, без дефектов"}
                  hint="Видна покупателю на плашке товара. Перевод — во вкладке «Переводы». Товар попадёт в подборку «Уценка»."
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
  );
}
