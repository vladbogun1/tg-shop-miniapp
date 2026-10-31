"use client";

import { Toggle } from "@/components/ui/Toggle";
import type { ProductCtx } from "../ctx";

export function PublishToggle({ x }: { x: ProductCtx }) {
  const { f, set, product, cardStatus } = x;
  return (
      <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
        <Toggle checked={f.active} onChange={(v) => set("active", v)} label="На витрине (виден в каталоге)" />
        {f.active && product?.active === false && cardStatus === "DRAFT" && (
          <p className="mt-2 pl-14 text-[12px] text-[var(--text-faint)]">Карточка не оформлена — при сохранении спросим, выкладывать ли.</p>
        )}
      </div>
  );
}
