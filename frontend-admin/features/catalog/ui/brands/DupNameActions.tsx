"use client";

import { Button } from "@shop/ui/admin-button";
import type { AdminBrand } from "../../model/types";

/** Под полем названия при дубле: «Открыть существующий» и «Объединить с ним» (вместо тупика с ошибкой). */
export function DupNameActions({
  dup,
  editing,
  onOpen,
  onMerge,
}: {
  dup: AdminBrand | undefined;
  editing: AdminBrand | null;
  onOpen?: (b: AdminBrand) => void;
  onMerge?: (b: AdminBrand) => void;
}) {
  if (!dup || (!onOpen && !onMerge)) return null;
  return (
    <div className="-mt-2 flex flex-wrap gap-2">
      {onOpen && (
        <Button size="sm" variant="outline" onClick={() => onOpen(dup)}>
          Открыть «{dup.name}»
        </Button>
      )}
      {onMerge && editing && editing.id !== dup.id && (
        <Button size="sm" variant="outline" onClick={() => onMerge(dup)}>
          Объединить с «{dup.name}»
        </Button>
      )}
    </div>
  );
}
