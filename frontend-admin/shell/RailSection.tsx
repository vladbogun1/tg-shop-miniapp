"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "@shop/ui/overlay";
import { cn } from "@/lib/cn";
import { NavRow } from "./NavRow";
import { isActive, type BadgeKey, type NavItem, type NavSection } from "./nav-config";
import type { BadgeInfo } from "./use-nav-badges";

/**
 * Collapsed rail: one icon per section instead of every item (20 icons did not fit the screen).
 * Hover (or click / Enter) opens a flyout to the right with the section's items, labels and counters;
 * it closes on leaving both, an outside press, Esc (overlay stack — not the page's modals) and on
 * navigation. The icon is highlighted when the open page lives in the section and carries a dot
 * when something in it waits.
 */
export function RailSection({
  sec,
  items,
  badges,
  pathname,
  layoutScope,
  onNavigate,
}: {
  sec: NavSection;
  items: NavItem[];
  badges: Record<BadgeKey, BadgeInfo>;
  pathname: string;
  layoutScope: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = sec.icon;
  const hasActive = items.some((i) => isActive(pathname, i.href, i.exact));
  const pending = items.reduce(
    (n, i) => n + (i.badge ? badges[i.badge].count : 0),
    0,
  );
  const strong = items.some(
    (i) => i.badge && badges[i.badge].strong && badges[i.badge].count > 0,
  );
  const panelId = `rail-${layoutScope}-${sec.id}`;

  useOverlayLayer(open, () => setOpen(false), { lockScroll: false });

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
  };
  function show() {
    clearTimers();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right + 10 });
    setOpen(true);
  }
  const hoverIn = () => {
    clearTimers();
    openTimer.current = setTimeout(show, 90);
  };
  const hoverOut = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  };

  // Close on navigation and on a press outside the button and the flyout.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => clearTimers, []);

  // Keep the flyout on screen: shift it up if the section's list would run past the bottom edge.
  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current) return;
    const h = panelRef.current.offsetHeight;
    const maxTop = window.innerHeight - h - 12;
    if (pos.top > maxTop) setPos({ ...pos, top: Math.max(12, maxTop) });
  }, [open, pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${sec.title}${pending > 0 ? `, ждут: ${pending}` : ""}`}
        className={cn(
          "group relative flex min-h-10 w-full items-center justify-center rounded-[var(--r-md)] transition-colors",
          hasActive
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : open
              ? "bg-[var(--surface-2)] text-[var(--text)]"
              : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]",
        )}
      >
        {hasActive && (
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
          />
        )}
        <span className="relative">
          <Icon
            className="h-[18px] w-[18px]"
            strokeWidth={hasActive ? 2.25 : 2}
          />
          {pending > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]",
                strong ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
              )}
            />
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="absolute right-1 h-3 w-3 text-[var(--text-faint)] opacity-60"
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={sec.title}
            onMouseEnter={clearTimers}
            onMouseLeave={hoverOut}
            style={{ top: pos.top, left: pos.left }}
            className="rail-flyout fixed z-[160] w-[232px] rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-3)]"
          >
            <div className="font-display px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              {sec.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href, item.exact)}
                  badge={item.badge ? badges[item.badge] : undefined}
                  collapsed={false}
                  layoutScope={`${layoutScope}-flyout`}
                  onNavigate={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
