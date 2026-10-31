"use client";

import { Rocket } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import type { CardCompletion } from "./use-card-completion";

/** Что пошло не так при записи; если не хватает цены — поле цены и кнопка «Сохранить цену и выложить». */
export function ProblemBox({ c }: { c: CardCompletion }) {
  const { problem, price, setPrice, saving, savePrice } = c;
  if (!problem) return null;
  return (
    <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
      <div className="text-[13px] font-semibold text-[var(--danger-ink)]">✕ {problem.text}</div>
      {problem.needPrice && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-[180px]">
            <Input
              label="Укажите цену, чтобы выложить"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              rightSlot={<span className="text-[12px] text-[var(--text-faint)]">грн</span>}
            />
          </div>
          <Button variant="accent" icon={<Rocket className="h-4 w-4" />} loading={saving} disabled={!(Number(price.replace(",", ".")) > 0)} onClick={savePrice}>
            Сохранить цену и выложить
          </Button>
        </div>
      )}
    </div>
  );
}
