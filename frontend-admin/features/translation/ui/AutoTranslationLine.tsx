"use client";

/** Строка «Автоперевод» под заголовком «Переводов»: включён ли фоновый перевод и сколько символов месяца ушло. */
import { CircleAlert, CirclePause, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { autoLine, type AutoTone } from "../model/auto-status";
import { useAutoTranslationStatus } from "../queries";

const ICON: Record<AutoTone, typeof Sparkles> = { ok: Sparkles, warn: CircleAlert, off: CirclePause };
const COLOR: Record<AutoTone, string> = {
  ok: "text-[var(--text-faint)]",
  warn: "text-[var(--warn,#F59E0B)]",
  off: "text-[var(--text-faint)]",
};

export function AutoTranslationLine() {
  const { data } = useAutoTranslationStatus();
  if (!data) return null;
  const line = autoLine(data);
  const Icon = ICON[line.tone];
  return (
    <p className={cn("mb-3 flex items-start gap-1.5 text-[12.5px] leading-snug", COLOR[line.tone])} title={line.detail}>
      <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{line.text}</span>
    </p>
  );
}
