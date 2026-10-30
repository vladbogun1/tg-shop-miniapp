"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtCount, type BadgeInfo } from "./use-nav-badges";
import type { NavItem } from "./nav-config";

function NavIcon({ icon: Icon, active, dot }: { icon: NavItem["icon"]; active: boolean; dot?: BadgeInfo }) {
  return (
    <span className="relative">
      <Icon
        className={cn(
          "h-[18px] w-[18px] transition-colors",
          active ? "text-[var(--accent)]" : "text-[var(--text-faint)] group-hover:text-[var(--text-muted)]",
        )}
        strokeWidth={active ? 2.25 : 2}
      />
      {/* Collapsed rail: the count shrinks to a dot on the icon. */}
      {dot && (
        <span
          aria-hidden
          className={cn(
            "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]",
            dot.strong ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
          )}
        />
      )}
    </span>
  );
}

function NavCount({ badge, collapsed }: { badge: BadgeInfo; collapsed: boolean }) {
  return (
    <span
      aria-label={badge.label}
      className={cn("count-badge ml-auto", !badge.strong && "count-badge--muted", collapsed && "sr-only")}
    >
      {fmtCount(badge.count)}
    </span>
  );
}

export function NavRow({
  item,
  active,
  badge,
  collapsed,
  layoutScope,
  onNavigate,
  tabIndex,
}: {
  item: NavItem;
  active: boolean;
  badge?: BadgeInfo;
  collapsed: boolean;
  layoutScope: string;
  onNavigate?: () => void;
  tabIndex?: number;
}) {
  const Icon = item.icon;
  const showBadge = !!badge && badge.count > 0;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      tabIndex={tabIndex}
      title={collapsed ? item.label : badge?.title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-display group relative flex min-h-11 items-center gap-3 rounded-[var(--r-md)] text-[14px] font-semibold tracking-[0.01em] transition-colors lg:min-h-10",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      {active && (
        <motion.span
          layoutId={`nav-active-${layoutScope}`}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
        />
      )}
      <NavIcon icon={Icon} active={active} dot={collapsed && showBadge ? badge : undefined} />
      <span className={cn("truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {showBadge && <NavCount badge={badge} collapsed={collapsed} />}
    </Link>
  );
}
