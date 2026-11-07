"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { widgetHidden, widgetLine } from "../model/widget";
import { useAiWidget } from "../queries-center";

/**
 * Чип в строке «Сегодня» над доской заказов (слот `trailing`): владельцу «Расход 19 из 420 ₴ · ждёт проверки 14»,
 * админу «ИИ можно запускать · ждёт проверки 14». Ведёт в центр ИИ-задач. Не настроен и нечего ждать — строки нет.
 */
export function AiDashboardWidget({ chipClass }: { chipClass: string }) {
  const { data } = useAiWidget();
  if (!data || widgetHidden(data)) return null;
  return (
    <Link href="/ai-tasks" data-testid="ai-widget" className={chipClass}>
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span>{widgetLine(data)}</span>
    </Link>
  );
}
