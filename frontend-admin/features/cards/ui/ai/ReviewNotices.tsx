"use client";

import { AiNotice } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import type { PublishProblem } from "../../model/completion";

/** Плашки над ревью карточки: ответ не разобрался, карточку изменили, не хватает цены. */
export function ReviewNotices(p: {
  problems: string[];
  versionChanged: boolean;
  mostly: boolean;
  onFresh: () => void;
  problem: PublishProblem | null;
  price: string;
  setPrice: (v: string) => void;
  priceOk: boolean;
  onSavePrice: () => void;
}) {
  return (
    <>
      {p.problems.map((t) => (
        <AiNotice key={t} tone="warn">{t}</AiNotice>
      ))}
      {p.versionChanged && !p.mostly && <AiNotice tone="warn">Карточку изменили после запуска ИИ — изменённые поля заблокированы.</AiNotice>}
      {p.mostly && (
        <div className="flex flex-col items-start gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12.5px] text-[var(--warn)]">
          Карточка заметно изменилась, пока работал ИИ: большая часть предложений заблокирована.
          <Button size="sm" variant="accent" onClick={p.onFresh}>Повторить на актуальной карточке</Button>
        </div>
      )}
      {p.problem && <AiNotice tone="bad">{p.problem.text}</AiNotice>}
      {p.problem?.needPrice && (
        <div className="flex items-center gap-2">
          <input
            value={p.price}
            onChange={(e) => p.setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Цена, ₴"
            aria-label="Цена в гривнах"
            className="h-10 w-32 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 text-[13px]"
          />
          <Button size="sm" variant="accent" disabled={!p.priceOk} onClick={p.onSavePrice}>Сохранить цену и выложить</Button>
        </div>
      )}
    </>
  );
}
