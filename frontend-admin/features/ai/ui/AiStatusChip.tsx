"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { chipView } from "../model/chip";
import { useAiSummary } from "../queries";

/**
 * Чип ✦ в шапке: идёт задача (пульсирует), ждёт проверки (число), сбой (красная точка). Виден на 320 и 375 px: только
 * значок и число, без слов. Ведёт к карточкам, где результаты ждут проверки. Нечего показывать — чипа нет.
 */
export function AiStatusChip() {
  const v = chipView(useAiSummary().data);
  if (!v) return null;
  return (
    <Link
      href="/cards"
      aria-label={v.label}
      title={v.label}
      data-testid="ai-chip"
      className="nb-press relative inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-2 text-[12px] font-bold text-[var(--accent)]"
    >
      <Sparkles className={cn("h-4 w-4", v.running && "animate-pulse")} />
      {v.waiting > 0 && <span className="tabular-nums">{v.waiting}</span>}
      {v.problem && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />}
    </Link>
  );
}
