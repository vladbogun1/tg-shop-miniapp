"use client";

/**
 * Меню «⋯»: на ноутбуке — выпадающий список в портале, на телефоне — шторка с действиями (44 px).
 * Общий примитив: такой же у «Команды» (`features/staff/ui/RowMenu.tsx`) — вынести в components/ui.
 */
import { MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/use-media";

export interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  /** Пояснение под пунктом (почему недоступно) — только на телефоне в подписи, на ноуте в подсказке. */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function RowMenu({ title, items }: { title: string; items: MenuItem[] }) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
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
          actions={items.map<SheetAction>((i) => ({
            key: i.key,
            label: i.hint ? (
              <span className="flex min-w-0 flex-col items-start whitespace-normal text-left">
                {i.label}
                <span className="text-[11.5px] font-normal opacity-70">{i.hint}</span>
              </span>
            ) : (
              i.label
            ),
            icon: i.icon,
            danger: i.danger,
            disabled: i.disabled,
            onSelect: i.onSelect,
          }))}
        />
      )}
    </>
  );
}

function Popover({ anchor, items, onClose }: { anchor: React.RefObject<HTMLButtonElement | null>; items: MenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = 260;
    const height = items.length * 40 + 10;
    const below = r.bottom + 6 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height), left: Math.max(8, r.right - width) });
  }, [anchor, items.length]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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
    <div ref={menu} role="menu" className="elevated fixed z-[150] w-[260px] overflow-hidden p-1" style={{ top: pos.top, left: pos.left }}>
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          role="menuitem"
          disabled={i.disabled}
          title={i.hint}
          onClick={() => {
            onClose();
            i.onSelect();
          }}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
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
