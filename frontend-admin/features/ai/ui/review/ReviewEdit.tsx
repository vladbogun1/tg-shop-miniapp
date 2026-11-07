"use client";

import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import type { ReviewField } from "../../model/review-model";

const INPUT =
  "w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[16px] text-[var(--text)] outline-none focus:border-[var(--accent)] sm:text-[13px]";

/**
 * Правка предложенного значения прямо в ревью: строка (название, характеристика) или текст (описание). Проверяет
 * значение владелец (`onSave` → текст ошибки или null): не прошло — ошибка под полем, правка не закрывается.
 * Enter в строке — сохранить, Esc — отмена.
 */
export function ReviewEdit({ field, onSave, onCancel }: { field: ReviewField; onSave: (value: string) => string | null; onCancel: () => void }) {
  const [value, setValue] = useState(field.after);
  const [error, setError] = useState<string | null>(null);
  const save = () => setError(onSave(value));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && field.editable === "line") {
      e.preventDefault();
      save();
    }
  };
  const common = {
    value,
    autoFocus: true,
    "aria-label": `Новое значение: ${field.label}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onKeyDown: keys,
  };
  return (
    <div className="flex flex-col gap-2 px-3 pb-3 pl-10" data-testid="ai-review-edit">
      {field.editable === "text" ? <textarea {...common} rows={6} className={`${INPUT} thin-scroll resize-y leading-snug`} /> : <input {...common} className={`${INPUT} h-10`} />}
      {error && <p className="text-[12px] text-[var(--danger-ink)]" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="accent" onClick={save}>Сохранить</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  );
}
