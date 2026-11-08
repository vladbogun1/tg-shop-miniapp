"use client";

import { Button } from "@shop/ui/admin-button";
import { useState } from "react";
import { isActive } from "@/features/ai";
import { CopyButton } from "@/features/translation";
import { buildMatchPrompt, type LeafCategory } from "../../model/ai/match-prompt";
import type { CatalogItem, ReviewRow } from "../../model/ai/types";
import { MatchWithAi, useMatchJob } from "./MatchWithAi";
import { AnswerBox, Messages } from "./ReadStep";
import type { SupplyAi } from "./use-supply-ai";

/** Ручной путь шага 2: промпт с нерешёнными строками → чат ИИ → ответ обратно. */
function ManualHelp({ ai, open, catalog, categories, accent }: { ai: SupplyAi; open: ReviewRow[]; catalog: CatalogItem[]; categories: LeafCategory[]; accent: boolean }) {
  const [answer, setAnswer] = useState("");
  const [applied, setApplied] = useState<number | null>(null);
  const prompt = open.length > 0 ? buildMatchPrompt(open, catalog, categories) : "";
  return (
    <div className="flex flex-col gap-2">
      {open.length > 0 && (
        <>
          <p className="text-[13px] text-[var(--text-muted)]">
            В промпте только эти строки и по 8 похожих товаров к каждой. ИИ скажет, какой из них подходит, или назовёт новый товар (поищет его в интернете).
          </p>
          <div>
            <CopyButton text={prompt} label={`Скопировать промпт (${open.length})`} variant={answer || !accent ? "surface" : "accent"} />
          </div>
          <AnswerBox
            value={answer}
            onChange={setAnswer}
            onCheck={(t) => setApplied(ai.applyHelp(t))}
            label="Ответ ИИ по строкам"
            placeholder={'Ответ ИИ — блок ```json { "L1": { … } } ```'}
          />
        </>
      )}
      {applied != null && <div className="text-[13px] font-semibold text-[var(--ok)]">✓ Принято решений: {applied} — проверьте строки ниже</div>}
    </div>
  );
}

/**
 * Шаг 2: строки, которые поиск не нашёл уверенно. Пока встроенный ИИ доступен, он сопоставляет их сам (сразу после
 * чтения); ручной путь через чат спрятан под кнопкой. Иначе — ручной путь, как раньше.
 */
export function HelpPanel({ ai, catalog, categories }: { ai: SupplyAi; catalog: CatalogItem[]; categories: LeafCategory[] }) {
  const open = ai.rows.filter((r) => r.decision.kind === "open");
  const m = useMatchJob(ai, open, catalog, categories);
  const [manual, setManual] = useState(false);
  const builtIn = m.reason === null;
  // У неудачной задачи своя кнопка «Через ChatGPT вручную» — вторую рядом не показываем.
  const failed = m.job != null && !isActive(m.job.status) && m.job.status !== "DONE";
  if (open.length === 0 && m.job == null && ai.helpErrors.length === 0) return null;
  const title = open.length > 0 ? `${open.length} несопоставленных строк` : "готово";
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3" data-testid="supply-ai-help">
      <div className="field-label mb-1.5">Помощь ИИ: {title}</div>
      <div className="flex flex-col gap-3">
        <MatchWithAi m={m} open={open.length} onManual={() => setManual(true)} />
        {builtIn && !manual && !failed && open.length > 0 && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setManual(true)}>
              Через ChatGPT вручную
            </Button>
          </div>
        )}
        {(!builtIn || manual) && <ManualHelp ai={ai} open={open} catalog={catalog} categories={categories} accent={!builtIn} />}
      </div>
      <Messages errors={ai.helpErrors} notes={ai.helpNotes} />
    </div>
  );
}
