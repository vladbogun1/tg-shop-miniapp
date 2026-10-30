"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useIsSuperAdmin } from "@/features/staff";
import { cn } from "@/lib/cn";
import { localStore } from "@shop/core/storage";
import { NavRow } from "./NavRow";
import { RailSection } from "./RailSection";
import { DEFAULT_OPEN, OPEN_KEY, PRIMARY, SECTIONS, isActive, type NavItem } from "./nav-config";
import { fmtCount, useNavBadges } from "./use-nav-badges";

/**
 * Sidebar / drawer menu: the daily screens on top (no header), then folding sections by topic.
 * A folded section shows the sum of its counters next to the title; the section of the open page
 * is always unfolded. Active item: orange text + icon on a faint orange tint, with a 2px orange
 * indicator (glowing) on the left edge that slides between items. `collapsed` (desktop rail):
 * icons only, sections separated by hairlines — labels stay in the DOM as sr-only.
 */
export function NavLinks({
  onNavigate,
  collapsed = false,
  layoutScope,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  layoutScope: string;
}) {
  const pathname = usePathname();
  const badges = useNavBadges();
  const superAdmin = useIsSuperAdmin();
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStore.getItem(OPEN_KEY) ?? "null");
      if (saved && typeof saved === "object")
        setOpen({ ...DEFAULT_OPEN, ...saved });
    } catch {
      /* private mode / bad JSON — defaults */
    }
  }, []);
  function toggle(id: string) {
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try {
        localStore.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode — not remembered */
      }
      return next;
    });
  }

  const row = (item: NavItem, hidden = false) => (
    <NavRow
      key={item.href}
      item={item}
      active={isActive(pathname, item.href, item.exact)}
      badge={item.badge ? badges[item.badge] : undefined}
      collapsed={collapsed}
      layoutScope={layoutScope}
      onNavigate={onNavigate}
      tabIndex={hidden ? -1 : undefined}
    />
  );

  return (
    <nav className={cn("flex flex-col", collapsed ? "gap-1" : "gap-0.5")}>
      {PRIMARY.map((i) => row(i))}
      {SECTIONS.map((sec) => {
        const items = sec.items.filter((i) => !i.superOnly || superAdmin);
        if (items.length === 0) return null;
        if (collapsed) {
          return (
            <div
              key={sec.id}
              className={cn(
                sec.id === SECTIONS[0].id &&
                  "mt-2 border-t border-[var(--line)] pt-2",
              )}
            >
              <RailSection
                sec={sec}
                items={items}
                badges={badges}
                pathname={pathname}
                layoutScope={layoutScope}
                onNavigate={onNavigate}
              />
            </div>
          );
        }
        const hasActive = items.some((i) =>
          isActive(pathname, i.href, i.exact),
        );
        const expanded = hasActive || !!open[sec.id];
        const pending = items.reduce(
          (n, i) => n + (i.badge ? badges[i.badge].count : 0),
          0,
        );
        const strong = items.some(
          (i) => i.badge && badges[i.badge].strong && badges[i.badge].count > 0,
        );
        const panelId = `nav-sec-${layoutScope}-${sec.id}`;
        return (
          <div key={sec.id} className="mt-3">
            <button
              type="button"
              onClick={() => !hasActive && toggle(sec.id)}
              aria-expanded={expanded}
              aria-controls={panelId}
              title={hasActive ? "Здесь открытая страница" : undefined}
              className={cn(
                "group/sec flex h-8 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-left transition-colors",
                hasActive ? "cursor-default" : "hover:bg-[var(--surface-2)]",
              )}
            >
              <span
                className={cn(
                  "font-display text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors",
                  hasActive
                    ? "text-[var(--text-muted)]"
                    : "text-[var(--text-faint)] group-hover/sec:text-[var(--text-muted)]",
                )}
              >
                {sec.title}
              </span>
              <span aria-hidden className="h-px flex-1 bg-[var(--line)]" />
              {!expanded && pending > 0 && (
                <span
                  aria-label={`В разделе ждут: ${pending}`}
                  className={cn(
                    "count-badge !h-[18px] !min-w-[18px] !text-[10.5px]",
                    !strong && "count-badge--muted",
                  )}
                >
                  {fmtCount(pending)}
                </span>
              )}
              {!hasActive && (
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] transition-transform duration-200",
                    expanded ? "rotate-0" : "-rotate-90",
                  )}
                />
              )}
            </button>
            {/* Plain CSS fold (grid-rows 0fr ↔ 1fr): no framer layout animations inside the drawer. */}
            <div
              id={panelId}
              inert={!expanded || undefined}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                expanded
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pt-0.5">
                {items.map((i) => row(i, !expanded))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
