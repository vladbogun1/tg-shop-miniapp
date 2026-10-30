"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActionSheet, type SheetAction } from "@/components/orders/ActionSheet";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/use-media";
import { adminName, inviteName } from "../model/roles";
import type { TeamRow } from "../model/team-rows";

export interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export function RowMenu({ row, itemsFor }: { row: TeamRow; itemsFor: (row: TeamRow) => MenuItem[] }) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const items = itemsFor(row);
  const title = row.type === "admin" ? adminName(row.admin) : inviteName(row.invite);

  if (row.type === "admin" && row.admin.self) {
    return (
      <Link href="/account" className="hit whitespace-nowrap text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
        Мой аккаунт
      </Link>
    );
  }
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Действия: ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {desktop ? (
        open && <Popover anchor={btn} items={items} onClose={() => setOpen(false)} />
      ) : (
        <ActionSheet
          open={open}
          title={title}
          onClose={() => setOpen(false)}
          actions={items.map<SheetAction>((i) => ({ key: i.key, label: i.label, icon: i.icon, danger: i.danger, onSelect: i.onSelect }))}
        />
      )}
    </>
  );
}

/** Desktop dropdown in a portal (the table scrolls horizontally and would clip it). */
function Popover({ anchor, items, onClose }: { anchor: React.RefObject<HTMLButtonElement | null>; items: MenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = 248;
    const height = items.length * 40 + 10;
    const below = r.bottom + 6 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height), left: Math.max(8, r.right - width) });
  }, [anchor, items.length]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Opening may itself scroll the table into place: only a later scroll closes the menu.
    const openedAt = performance.now();
    const scroll = () => performance.now() - openedAt > 250 && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={menu}
      role="menu"
      className="elevated fixed z-[150] w-[248px] overflow-hidden p-1"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            i.onSelect();
          }}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)]",
            i.danger ? "text-[var(--danger-ink)]" : "text-[var(--text)]"
          )}
        >
          <span className="shrink-0 opacity-80">{i.icon}</span>
          {i.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
