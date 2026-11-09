"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { widgetChip, widgetHidden, widgetLine } from "../model/widget";
import { useAiWidget } from "../queries-center";

/**
 * Чип в строке «Сегодня» над доской заказов (слот `trailing`), как остальные: подпись капсом + значение —
 * владельцу «Расход ИИ · 19 ₴ из 420 ₴ · ждёт 14», админу «ИИ · ждёт 14». Полная фраза — в aria-label и title.
 * Ведёт в центр ИИ-задач. Не настроен и нечего ждать — чипа нет. Не шире экрана: на 320 и 375 px не обрезается.
 */
export function AiDashboardWidget({ chipClass }: { chipClass: string }) {
  const { data } = useAiWidget();
  if (!data || widgetHidden(data)) return null;
  const line = widgetLine(data);
  const chip = widgetChip(data);
  // Same shape as the other «Сегодня» chips: caps label + bold value (the old plain sentence stood out among them).
  return (
    <Link href="/ai-tasks" data-testid="ai-widget" aria-label={`ИИ: ${line}`} title={line} className={cn(chipClass, "max-w-[calc(100vw-32px)] md:max-w-none")}>
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="font-display text-[11px] uppercase tracking-[0.06em] max-md:hidden">{chip.label}</span>
      <span className="tabular min-w-0 truncate text-[13px] font-bold text-[var(--text)]">{chip.value}</span>
    </Link>
  );
}
