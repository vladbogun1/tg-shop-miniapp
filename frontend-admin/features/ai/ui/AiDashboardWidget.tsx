"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { widgetHidden, widgetLine } from "../model/widget";
import { useAiWidget } from "../queries-center";

/**
 * Одна строка на дашборде: владельцу «Расход 19 из 420 ₴ · ждёт проверки 14», админу «ИИ можно запускать · ждёт
 * проверки 14». Ведёт в центр ИИ-задач. Не настроен и нечего ждать — строки нет.
 */
export function AiDashboardWidget() {
  const { data } = useAiWidget();
  if (!data || widgetHidden(data)) return null;
  return (
    <Link
      href="/ai-tasks"
      data-testid="ai-widget"
      className="nb-press mb-3 flex min-w-0 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)]"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 truncate">{widgetLine(data)}</span>
    </Link>
  );
}
