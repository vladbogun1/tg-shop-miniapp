"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Что оболочка рисует сразу под шапкой каждой страницы — строка вкладок раздела. Слот, а не импорт:
 * вкладкам нужны счётчики фич, а фичи сами рисуют PageHeader (был бы цикл импортов).
 */
export const PageHeaderSlot = createContext<ReactNode>(null);

/** Screen heading: Exo 2 800 caps title (desktop; on a phone the top bar shows it) + muted subtitle + actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const below = useContext(PageHeaderSlot);
  // На телефоне строка вкладок раздела идёт сразу под подзаголовком, а кнопки страницы — под ней: шапка
  // становится `contents`, порядок задаёт `order` в общей колонке. На ПК — как было: заголовок и кнопки
  // в одной строке, вкладки под ними.
  return (
    <div className="flex min-w-0 flex-col max-lg:mb-4 max-lg:gap-3">
      <div className={cn("flex flex-wrap items-end justify-between gap-3 max-lg:contents lg:mb-5", className)}>
        <div className="max-lg:order-1">
          {/* On a phone the shell's top bar already shows the title — no second one (kept for screen readers). */}
          <h1 className="page-title max-lg:sr-only text-[26px] leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] leading-snug text-[var(--text-muted)] lg:mt-1 lg:text-[14px]">{subtitle}</p>}
        </div>
        {/* max-w-full: a wide segmented control scrolls inside itself instead of pushing the page sideways. */}
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-lg:order-3">{actions}</div>}
      </div>
      <div className="min-w-0 max-lg:order-2 empty:hidden">{below}</div>
    </div>
  );
}
