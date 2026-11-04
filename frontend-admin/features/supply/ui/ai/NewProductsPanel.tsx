"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { LeafCategory } from "../../model/ai/match-prompt";
import type { SupplyAi } from "./use-supply-ai";

/** Новые товары: создадутся скрытыми черновиками с остатком 0 — дальше их оформят «Карточки». */
export function NewProductsPanel({ ai, categories }: { ai: SupplyAi; categories: LeafCategory[] }) {
  if (ai.plans.length === 0) return null;
  const options = categories.map((c) => ({ value: c.id, label: c.name }));
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
      <div className="field-label mb-1">Новые товары: {ai.plans.length}</div>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        Создадутся скрытыми черновиками с остатком 0. Цена — черновая (закупка × курс × 2), её правят до публикации; характеристики и фото добавят «Карточки».
      </p>
      <div className="flex flex-col gap-3">
        {ai.plans.map((p) => (
          <div key={p.lineIds[0]} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_120px] sm:items-end">
            <Input label={`Название · строки ${p.lineIds.join(", ")}`} value={p.title} onChange={(e) => ai.editDraft(p.key, { title: e.target.value })} />
            <Select label="Категория" value={p.categoryId ?? ""} options={options} onChange={(v) => ai.editDraft(p.key, { categoryId: v })} />
            <Input
              label="Цена, ₴"
              inputMode="decimal"
              value={ai.prices[p.key] ?? (p.priceUah != null ? String(p.priceUah) : "")}
              onChange={(e) => ai.setPrices({ ...ai.prices, [p.key]: e.target.value })}
            />
            {(p.brand || p.variants.length > 0) && (
              <div className="text-[12.5px] text-[var(--text-muted)] sm:col-span-3">
                {[p.brand && `бренд ${p.brand}`, p.variants.length > 0 && `варианты: ${p.variants.join(", ")}`].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
