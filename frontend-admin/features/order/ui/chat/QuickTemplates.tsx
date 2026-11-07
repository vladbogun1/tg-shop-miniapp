"use client";

import { Zap } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { RenderedTemplate } from "../../api";
import { LOCALE_LABEL } from "./template-meta";

const SHOWN = 5;
const TITLE_MAX = 18;

const short = (s: string) => (s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1)}…` : s);

/**
 * Над полем ввода: до пяти быстрых шаблонов одним касанием (вставляет текст, как «⚡»), «Все…» открывает список.
 * Тексты рендерит сервер на языке клиента — тот же запрос, что у списка. Если язык не русский — «Ответ уйдёт на: укр».
 */
export function QuickTemplates({
  templates: q,
  onPick,
  onAll,
}: {
  templates: UseQueryResult<RenderedTemplate[]>;
  onPick: (text: string) => void;
  onAll: () => void;
}) {
  const list = q.data ?? [];
  if (list.length === 0) return null;
  const locale = list[0].locale;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.slice(0, SHOWN).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.text)}
            title={t.title}
            className="nb-press h-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:border-[var(--line-strong)] pointer-coarse:h-11"
          >
            {short(t.title)}
          </button>
        ))}
        <button
          type="button"
          onClick={onAll}
          className="nb-press flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--line-strong)] px-3 text-[12.5px] font-medium text-[var(--accent-hi)] pointer-coarse:h-11"
        >
          <Zap className="h-3.5 w-3.5" /> Все…
        </button>
      </div>
      {locale !== "ru" && (
        <span className="chip-tint shrink-0 !bg-[var(--surface-3)] !px-2 !text-[10px]" title="Язык клиента">
          Ответ уйдёт на: {LOCALE_LABEL[locale] ?? locale}
        </span>
      )}
    </div>
  );
}
