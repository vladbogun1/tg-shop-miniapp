"use client";

import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useInbox } from "@/lib/inbox";
import { TABS, isActive } from "./nav-config";

const TAB_CELL =
  "font-display relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.06em] transition-colors";

/** Tab icon box; the active colour comes from the cell (orange icon + label). */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <span className="relative grid h-7 w-10 place-items-center">
      {children}
    </span>
  );
}

/** 2px glowing orange bar on the top edge of the active tab (as in the Mini App), slides between tabs. */
function TabIndicator() {
  return (
    <motion.span
      layoutId="tab-active"
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="absolute left-1/2 top-0 h-[2px] w-9 -translate-x-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_2px_rgba(255,102,0,.55)]"
    />
  );
}

export function TabBar({
  menuOpen,
  onMenu,
}: {
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
  const onTab = TABS.some((t) => isActive(pathname, t.href, t.exact));
  const moreActive = menuOpen || !onTab;

  return (
    <nav
      aria-label="Главные разделы"
      data-app-chrome
      className="tabbar fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--line)] bg-[rgba(26,26,26,.92)] backdrop-blur-md lg:hidden"
      style={{
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
    >
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch">
        {TABS.map((t) => {
          const active = !menuOpen && isActive(pathname, t.href, t.exact);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                TAB_CELL,
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
              )}
            >
              {active && <TabIndicator />}
              <TabIcon>
                <Icon
                  className="h-[21px] w-[21px]"
                  strokeWidth={active ? 2.25 : 2}
                />
                {t.badge && inboxTotal > 0 && (
                  <span
                    aria-label={`Требует внимания: ${inboxTotal}`}
                    className="count-badge absolute -right-1 -top-1.5 ring-2 ring-[#1A1A1A]"
                  >
                    {inboxTotal > 99 ? "99+" : inboxTotal}
                  </span>
                )}
              </TabIcon>
              <span className="max-w-full truncate px-0.5">{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMenu}
          aria-label="Ещё — все разделы"
          aria-expanded={menuOpen}
          className={cn(
            TAB_CELL,
            moreActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
          )}
        >
          {moreActive && <TabIndicator />}
          <TabIcon>
            <Menu
              className="h-[21px] w-[21px]"
              strokeWidth={moreActive ? 2.25 : 2}
            />
          </TabIcon>
          <span>Ещё</span>
        </button>
      </div>
    </nav>
  );
}
