"use client";

import { Button } from "@shop/ui/admin-button";
import { CenterSpinner } from "@/components/ui/Spinner";
import { AnswerStep } from "./AnswerStep";
import { HiddenNotice } from "./HiddenNotice";
import { ProblemBox } from "./ProblemBox";
import { PromptStep } from "./PromptStep";
import { ReviewStep } from "./ReviewStep";
import type { CardCompletion } from "./use-card-completion";

/** Ручной путь («Через ChatGPT вручную»): промпт → ответ → проверка → сохранение; назад — к встроенному ИИ. */
export function ManualBody({ c, onBackToAi }: { c: CardCompletion; onBackToAi?: () => void }) {
  const { item, schema, saved, published, problem } = c;
  if (c.loading) return <CenterSpinner label="Загрузка товара и схемы…" />;
  if (!item || !schema) {
    return (
      <div className="text-[13px] font-semibold text-[var(--danger-ink)]">
        ✕ {!item ? "Товар не найден." : "Не удалось загрузить схему каталога."}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {onBackToAi && !saved && (
        <div>
          <Button variant="ghost" size="sm" onClick={onBackToAi}>Вернуться к встроенному ИИ ✦</Button>
        </div>
      )}
      <HiddenNotice c={c} />
      <PromptStep c={c} />
      {!saved && <AnswerStep c={c} />}
      <ReviewStep c={c} />
      {saved && !published && !problem && <div className="text-[13px] font-semibold text-[var(--ok)]">✓ Карточка сохранена.</div>}
      <ProblemBox c={c} />
    </div>
  );
}
