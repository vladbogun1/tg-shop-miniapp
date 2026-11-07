"use client";

import { Button } from "@shop/ui/admin-button";
import { CenterSpinner } from "@/components/ui/Spinner";
import { AnswerStep } from "./AnswerStep";
import { HiddenNotice } from "./HiddenNotice";
import { ManualReview } from "./ManualReview";
import { PromptStep } from "./PromptStep";
import type { CardCompletion } from "./use-card-completion";

/**
 * Ручной путь («Через ChatGPT вручную»): промпт → ответ → проверка в том же экране, что у встроенного ИИ
 * (`ManualReview`); назад — к встроенному ИИ.
 */
export function ManualBody({ c, onBackToAi }: { c: CardCompletion; onBackToAi?: () => void }) {
  const { item, schema } = c;
  if (c.loading) return <CenterSpinner label="Загрузка товара и схемы…" />;
  if (!item || !schema) {
    return (
      <div className="text-[13px] font-semibold text-[var(--danger-ink)]">
        ✕ {!item ? "Товар не найден." : "Не удалось загрузить схему каталога."}
      </div>
    );
  }
  if (c.review) {
    return (
      <div className="flex flex-col gap-3">
        <HiddenNotice c={c} />
        <ManualReview c={c} onBackToAi={onBackToAi} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {onBackToAi && (
        <div>
          <Button variant="ghost" size="sm" onClick={onBackToAi}>Вернуться к встроенному ИИ ✦</Button>
        </div>
      )}
      <HiddenNotice c={c} />
      <PromptStep c={c} />
      <AnswerStep c={c} />
      {c.saved && !c.published && <div className="text-[13px] font-semibold text-[var(--ok)]">✓ Карточка сохранена.</div>}
    </div>
  );
}
