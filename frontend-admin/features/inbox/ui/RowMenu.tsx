"use client";

import { Check, Clock, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useCloseOnAnchorMove } from "@/lib/use-close-on-anchor-move";
import { SNOOZE_OPTIONS, type SnoozePreset } from "../model/types";

/** Height the menu needs (header + 3 presets + separator + «Разобрано»): flip upwards when there is less room below. */
const MENU_HEIGHT = 232;

interface Pos {
  right: number;
  top?: number;
  bottom?: number;
}

const ITEM =
  "flex w-full items-center justify-between gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none";

/**
 * «⋯» of a desktop row: «Отложить» presets and, for informational rows, «Разобрано». A portal with
 * its own position (flips up near the bottom edge), so a card or a narrow window never clips it.
 * Keys: ↑ ↓ move, Enter picks, 1–3 pick a preset, Esc / a click outside closes.
 */
export function RowMenu({
  dismissible,
  onSnooze,
  onDismiss,
}: {
  dismissible: boolean;
  onSnooze: (p: SnoozePreset) => void;
  onDismiss: () => void;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const close = (refocus = true) => {
    setPos(null);
    if (refocus) trigger.current?.focus();
  };

  function toggle() {
    if (open) return close(false);
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const flip = window.innerHeight - r.bottom < MENU_HEIGHT && r.top > MENU_HEIGHT;
    setPos({
      right: Math.max(8, window.innerWidth - r.right),
      ...(flip ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }

  function items(): HTMLButtonElement[] {
    return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  }

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setPos(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useCloseOnAnchorMove(open, () => trigger.current, () => setPos(null));

  function onKeyDown(e: KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (/^[1-9]$/.test(e.key)) {
      const o = SNOOZE_OPTIONS[Number(e.key) - 1];
      if (o) {
        e.preventDefault();
        close(false);
        onSnooze(o.value);
      }
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Отложить"
        title="Отложить или отметить разобранным"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "nb-press focusable grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]",
          open && "border-[var(--line-strong)] text-[var(--text)]"
        )}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Отложить"
            onKeyDown={onKeyDown}
            className="elevated fixed z-[170] flex w-52 flex-col !rounded-[var(--r-md)] p-1"
            style={pos}
          >
            <div className="font-display flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
              <Clock className="h-3 w-3" /> Отложить
            </div>
            {SNOOZE_OPTIONS.map((o, idx) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  close(false);
                  onSnooze(o.value);
                }}
                className={ITEM}
              >
                {o.label}
                <kbd className="tabular text-[11px] text-[var(--text-faint)] pointer-coarse:hidden">{idx + 1}</kbd>
              </button>
            ))}
            {dismissible && (
              <>
                <div className="my-1 h-px bg-[var(--line)]" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    onDismiss();
                  }}
                  className={cn(ITEM, "justify-start text-[var(--ok)]")}
                >
                  <Check className="h-4 w-4" /> Разобрано
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
