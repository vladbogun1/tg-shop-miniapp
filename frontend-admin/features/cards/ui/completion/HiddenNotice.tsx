"use client";

import { TriangleAlert } from "lucide-react";
import type { CardCompletion } from "./use-card-completion";

/** Предупреждение: товар сохранён скрытым, пока карточка не оформлена. */
export function HiddenNotice({ c }: { c: CardCompletion }) {
  if (!((c.reason === "created" || c.item?.unfinished === true) && !c.published)) return null;
  return (
    <div className="flex gap-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3">
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" />
      <div className="text-[13px] leading-relaxed text-[var(--text)]">
        <b>Внимание: товар ещё не готов к показу.</b> Он сохранён скрытым — покупатели его не видят. Чтобы выложить, оформите
        карточку в нашем строгом формате: категория, бренд, характеристики по схеме и описание. Скопируйте промпт в ИИ с поиском в
        интернете (ChatGPT, Claude, Gemini…), вставьте ответ, проверьте и сохраните.
      </div>
    </div>
  );
}
