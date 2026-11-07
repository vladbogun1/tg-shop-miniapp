"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { widgetHidden, widgetLine, widgetShort } from "../model/widget";
import { useAiWidget } from "../queries-center";

/**
 * Чип в строке «Сегодня» над доской заказов (слот `trailing`): владельцу «Расход 19 из 420 ₴ · ждёт проверки 14»,
 * админу «ИИ можно запускать · ждёт проверки 14». Ведёт в центр ИИ-задач. Не настроен и нечего ждать — строки нет.
 * На телефоне строка короче («0 ₴ из 420 ₴ · ждёт 1 · проблем 1») и чип не шире экрана: на 320 и 375 px не обрезается.
 */
export function AiDashboardWidget({ chipClass }: { chipClass: string }) {
  const { data } = useAiWidget();
  if (!data || widgetHidden(data)) return null;
  const line = widgetLine(data);
  return (
    <Link href="/ai-tasks" data-testid="ai-widget" aria-label={`ИИ: ${line}`} title={line} className={cn(chipClass, "max-w-[calc(100vw-32px)] md:max-w-none")}>
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 truncate md:hidden">{widgetShort(data)}</span>
      <span className="hidden md:inline">{line}</span>
    </Link>
  );
}
