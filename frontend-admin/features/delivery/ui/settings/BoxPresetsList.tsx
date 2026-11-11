"use client";

/** Коробки окна «Створити ТТН» — только для чтения; меняются настройкой «Коробки» в блоке «Новая Почта». */
import { presetText } from "../../model/sender";
import { useBoxPresetsQuery } from "../../queries";

export function BoxPresetsList() {
  const q = useBoxPresetsQuery();
  const presets = q.data?.presets ?? [];
  return (
    <div className="min-w-0 border-t border-[var(--line)] pt-3">
      <div className="field-label mb-1.5">Коробки (готовые размеры в окне «Створити ТТН»)</div>
      {presets.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {presets.map((p) => (
            <li key={p.name} className="tabular break-words text-[13px] text-[var(--text)]">
              {presetText(p)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--text-muted)]">{q.isError ? "Не удалось загрузить коробки." : "Коробок нет."}</p>
      )}
      <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">Размеры в сантиметрах. Список меняется настройкой «Коробки» выше.</p>
    </div>
  );
}
