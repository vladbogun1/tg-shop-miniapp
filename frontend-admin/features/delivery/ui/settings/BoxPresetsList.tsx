"use client";

/**
 * «Коробки» в настройках доставки: что есть у упаковщиков (значок, название, «есть»). Из них окно «Создать ТТН»
 * и «Пакуй в» подбирают коробку. «Изменить коробки» — тот же редактор, что на «Отправке».
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { boxSizeText } from "../../model/packing";
import { useBoxesQuery } from "../../queries-packing";
import { BoxGlyph } from "../boxes/BoxGlyph";
import { BoxesModal } from "../boxes/BoxesPanel";

export function BoxPresetsList() {
  const q = useBoxesQuery();
  const [open, setOpen] = useState(false);
  const boxes = (q.data?.boxes ?? []).filter((b) => b.inStock);
  return (
    <div className="min-w-0 border-t border-[var(--line)] pt-3">
      <div className="field-label mb-1.5">Коробки (есть у упаковщиков)</div>
      {boxes.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {boxes.map((b) => (
            <li key={b.id} className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--text)]">
              <BoxGlyph box={b} size={28} className="shrink-0" />
              <span className="min-w-0 break-words">
                {b.name} <span className="tabular text-[var(--text-muted)]">· {boxSizeText(b)}</span>
              </span>
              <span className="ml-auto shrink-0 text-[11.5px] font-semibold text-[var(--accent-hi)]">есть</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--text-muted)]">
          {q.isError ? "Не удалось загрузить коробки." : q.isLoading ? "Загружаем…" : "Не отмечено ни одной — подбираем из всего каталога НП."}
        </p>
      )}
      <Button size="sm" variant="surface" className="mt-2 pointer-coarse:min-h-11" icon={<Pencil className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Изменить коробки
      </Button>
      {open && <BoxesModal onClose={() => setOpen(false)} />}
    </div>
  );
}
