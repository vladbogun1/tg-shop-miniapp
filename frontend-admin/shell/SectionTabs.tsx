"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsSuperAdmin } from "@/features/staff";
import { cn } from "@/lib/cn";
import { isTabActive, tabGroupFor, visibleTabs } from "./nav-config";
import { fmtCount, useNavBadges } from "./use-nav-badges";

/**
 * Строка вкладок раздела под шапкой страницы («Товары · Категории · Бренды»): каждая вкладка — своя
 * страница со своим адресом, поэтому это навигация ссылками (`aria-current`), а не tablist. Вид — как у
 * `components/ui/Tabs`: подчёркивание у активной, счётчик на вкладке. Рисуется через слот PageHeader
 * (см. Shell): на страницах вне групп и при одной видимой вкладке — ничего.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const superAdmin = useIsSuperAdmin();
  const badges = useNavBadges();
  const group = tabGroupFor(pathname);
  const tabs = group ? visibleTabs(group, superAdmin) : [];
  if (!group || tabs.length < 2) return null;
  return (
    <nav
      aria-label={`Раздел «${group.label}»`}
      className="thin-scroll -mt-1 mb-4 flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-[var(--line)] lg:-mt-2 lg:mb-5"
    >
      {tabs.map((t) => {
        const active = isTabActive(pathname, t);
        const badge = t.badge ? badges[t.badge] : undefined;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            title={badge?.title}
            className={cn(
              "font-display focusable relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors pointer-coarse:min-h-11",
              active ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {t.label}
            {badge && badge.count > 0 && (
              <span
                aria-label={badge.label}
                className={cn(
                  "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                  active ? "bg-[var(--accent-soft-2)] text-[var(--accent-hi)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]",
                )}
              >
                {fmtCount(badge.count)}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)] transition-[opacity,transform] duration-200",
                active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
