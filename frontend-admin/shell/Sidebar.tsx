"use client";

import { LogOut, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { logout } from "@/lib/session";
import { cn } from "@/lib/cn";
import { useLogoutEverywhere } from "@/features/staff";
import { NavLinks } from "./NavLinks";
import { isActive } from "./nav-config";

/** «Мой аккаунт» sits in the footer next to «Выйти» — it is about the admin, not the shop. */
function AccountLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, "/account");
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      title={collapsed ? "Мой аккаунт" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-display flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[14px] font-semibold transition-colors lg:min-h-10",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <UserRound
        className={cn(
          "h-[18px] w-[18px] shrink-0",
          active ? "text-[var(--accent)]" : "text-[var(--text-faint)]",
        )}
      />
      <span className={cn(collapsed && "sr-only")}>Мой аккаунт</span>
    </Link>
  );
}

/** Brand block: compact vector wordmark + «ADMIN» eyebrow; the collapsed rail shows the CS mark. */
function Brand({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <Link
        href="/"
        onClick={onNavigate}
        aria-label="ChiSetup Admin — на главную"
        className="mx-auto grid place-items-center rounded-[var(--r-md)]"
      >
        <LogoMark size={38} />
      </Link>
    );
  }
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="ChiSetup Admin — на главную"
      className="group flex flex-col items-start gap-1.5 rounded-[var(--r-md)] px-1 py-1"
    >
      <Wordmark
        size={21}
        className="transition-[filter] duration-150 group-hover:[filter:drop-shadow(0_0_10px_rgba(255,102,0,.35))]"
      />
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-[2px] w-5 rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
        />
        <span className="eyebrow !text-[10px] !tracking-[0.34em]">Admin</span>
      </span>
    </Link>
  );
}

export function SidebarInner({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
  layoutScope,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Desktop sidebar and phone menu are both mounted — each needs its own sliding indicator. */
  layoutScope: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center",
          collapsed ? "mb-4 justify-center" : "mb-6 px-2 pt-1",
        )}
      >
        <Brand collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <NavLinks
        onNavigate={onNavigate}
        collapsed={collapsed}
        layoutScope={layoutScope}
      />
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--line)] pt-3">
        <AccountLink collapsed={collapsed} onNavigate={onNavigate} />
        <button
          onClick={logout}
          title={collapsed ? "Выйти" : undefined}
          className={cn(
            "font-display flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[14px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger-ink)] lg:min-h-10",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span className={cn(collapsed && "sr-only")}>Выйти</span>
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className={cn(
              "mt-1 flex h-9 items-center gap-3 rounded-[var(--r-md)] text-[12.5px] text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            <span className="grid w-[18px] shrink-0 place-items-center">
              {collapsed ? (
                <PanelLeftOpen className="h-[16px] w-[16px]" />
              ) : (
                <PanelLeftClose className="h-[16px] w-[16px]" />
              )}
            </span>
            {!collapsed && <span>Свернуть</span>}
          </button>
        )}
      </div>
    </div>
  );
}
