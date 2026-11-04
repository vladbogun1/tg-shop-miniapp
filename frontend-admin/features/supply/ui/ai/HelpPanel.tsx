"use client";

import { useState } from "react";
import { CopyButton } from "@/features/translation";
import { buildMatchPrompt, type LeafCategory } from "../../model/ai/match-prompt";
import type { CatalogItem } from "../../model/ai/types";
import { AnswerBox, Messages } from "./ReadStep";
import type { SupplyAi } from "./use-supply-ai";

/** Шаг 2: нерешённые строки + их кандидаты → ИИ решает «наш товар или новый» и называет новые. */
export function HelpPanel({ ai, catalog, categories }: { ai: SupplyAi; catalog: CatalogItem[]; categories: LeafCategory[] }) {
  const [answer, setAnswer] = useState("");
  const [applied, setApplied] = useState<number | null>(null);
  const open = ai.rows.filter((r) => r.decision.kind === "open");
  if (open.length === 0 && applied == null) return null;
  const prompt = open.length > 0 ? buildMatchPrompt(open, catalog, categories) : "";
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="field-label mb-1.5">Помощь ИИ: {open.length > 0 ? `${open.length} несопоставленных строк` : "готово"}</div>
      {open.length > 0 && (
        <>
          <p className="mb-2 text-[13px] text-[var(--text-muted)]">
            В промпте только эти строки и по 8 похожих товаров к каждой. ИИ скажет, какой из них подходит, или назовёт новый товар (поищет его в интернете).
          </p>
          <CopyButton text={prompt} label={`Скопировать промпт (${open.length})`} variant={answer ? "surface" : "accent"} />
          <div className="mt-3">
            <AnswerBox
              value={answer}
              onChange={setAnswer}
              onCheck={(t) => setApplied(ai.applyHelp(t))}
              label="Ответ ИИ по строкам"
              placeholder={'Ответ ИИ — блок ```json { "L1": { … } } ```'}
            />
          </div>
        </>
      )}
      {applied != null && <div className="mt-2 text-[13px] font-semibold text-[var(--ok)]">✓ Принято решений: {applied} — проверьте строки ниже</div>}
      <Messages errors={ai.helpErrors} />
    </div>
  );
}
