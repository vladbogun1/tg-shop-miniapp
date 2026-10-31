"use client";

import { Sparkles } from "lucide-react";
import { BrandCombobox } from "@/features/catalog";
import type { ProductCtx } from "../ctx";

export function BrandBlock({ x }: { x: ProductCtx }) {
  const { f, set, brands, brandSuggestion } = x;
  return (
      <div>
        <BrandCombobox
          brands={brands}
          value={f.brand}
          onChange={(v) => set("brand", v)}
          hint="Справочник — в «Брендах». Новый бренд создастся при сохранении."
        />
        {brandSuggestion && !f.brand.name && (
          <button
            type="button"
            onClick={() => set("brand", { id: brandSuggestion.id, name: brandSuggestion.name })}
            className="nb-chip nb-press focusable mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            Предложить: {brandSuggestion.name}
            {!brandSuggestion.id && <span className="text-[var(--text-faint)]">(новый)</span>}
          </button>
        )}
      </div>
  );
}
