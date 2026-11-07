"use client";

import { AiNotice } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";

/** Плашки над ревью карточки по задаче ИИ: ответ не разобрался, карточку изменили (кто и сколько полей). */
export function ReviewNotices(p: {
  problems: string[];
  /** «Пока работал ИИ, карточку правил Иван · 2 из 7 полей изменены…»; null — карточку не меняли. */
  edited: string | null;
  mostly: boolean;
  /** Новая задача встроенного ИИ по актуальной карточке; нет — ответ вставили вручную, его вставляют заново. */
  onFresh?: () => void;
}) {
  return (
    <>
      {p.problems.map((t) => (
        <AiNotice key={t} tone="warn">{t}</AiNotice>
      ))}
      {p.edited && !p.mostly && <AiNotice tone="warn">{p.edited}</AiNotice>}
      {p.mostly && (
        <div className="flex flex-col items-start gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12.5px] text-[var(--warn)]">
          {p.edited ?? "Карточка заметно изменилась, пока работал ИИ"}. Большая часть предложений заблокирована.
          {p.onFresh ? (
            <Button size="sm" variant="accent" onClick={p.onFresh}>Повторить на актуальной карточке</Button>
          ) : (
            <span className="text-[var(--text-muted)]">Вставьте свежий ответ: меню → «Заполнить вручную через ChatGPT».</span>
          )}
        </div>
      )}
    </>
  );
}
