"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { readSummary, readSummaryText } from "../../model/ai/read-summary";
import type { SupplyAi } from "./use-supply-ai";

/** Плашка над строками: «Прочитано 6 из 6, сумма сошлась»; жёлтая, если что-то отброшено или сумма не сошлась. */
export function ReadBanner({ ai }: { ai: SupplyAi }) {
  const s = readSummary(ai.parsed, ai.sumIssue);
  if (!s) return null;
  const good = s.read === s.total && s.sumMatches !== false;
  const Icon = good ? CheckCircle2 : TriangleAlert;
  const repeats = ai.repeats.size;
  return (
    <div
      role="status"
      className={`flex min-w-0 items-start gap-2 rounded-[var(--r-md)] border px-3 py-2 text-[13px] font-semibold ${good ? "border-[var(--ok)] text-[var(--ok)]" : "border-[var(--warn)] text-[var(--warn)]"}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        {readSummaryText(s)}
        {repeats > 0 && <span className="font-normal text-[var(--text-muted)]"> · похоже на повтор на стыках: {repeats}, проверьте</span>}
      </span>
    </div>
  );
}
