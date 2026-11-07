"use client";

/**
 * Меню «⋯ Ещё»: группы Деньги / Заказ / Архив. На ПК — поповер над панелью, на телефоне то же содержимое
 * внутри листа (`MenuGroups` в ActionSheet). Опасное — красным, внизу своей группы.
 */
import { ChevronUp, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOverlayLayer } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import type { MenuGroup } from "./sheet-actions";

const ITEM =
  "nb-press flex min-h-9 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 text-left text-[13.5px] font-medium transition-colors disabled:opacity-40 pointer-coarse:min-h-11";

/** Группы пунктов; `onPick` закрывает меню и запускает действие. */
export function MenuGroups({
  groups,
  busyKey,
  onPick,
  role = "menuitem",
}: {
  groups: MenuGroup[];
  busyKey: string | null;
  onPick: (run: () => void) => void;
  role?: "menuitem" | "button";
}) {
  return (
    <div className="flex flex-col gap-1">
      {groups.map((g, gi) => (
        <div
          key={g.id}
          role={role === "menuitem" ? "group" : undefined}
          aria-label={g.title}
          className={cn(gi > 0 && "mt-1 border-t border-[var(--line)] pt-1")}
        >
          <div className="font-display px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            {g.title}
          </div>
          {g.items.map((it) => (
            <button
              key={it.key}
              type="button"
              role={role === "menuitem" ? "menuitem" : undefined}
              disabled={!!busyKey && busyKey !== it.busyKey}
              onClick={() => onPick(it.onSelect)}
              className={cn(
                ITEM,
                it.danger
                  ? "text-[var(--danger-ink)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                  : "text-[var(--text)] hover:bg-[var(--surface-3)]",
              )}
            >
              <span className={cn("shrink-0", !it.danger && "text-[var(--text-muted)]")}>{it.icon}</span>
              <span className="min-w-0 truncate">{it.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Кнопка «Ещё» с поповером (ПК). Закрывается по Esc (только верхний слой), клику снаружи и выбору пункта. */
export function MoreMenu({ groups, busyKey }: { groups: MenuGroup[]; busyKey: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useOverlayLayer(open, () => setOpen(false), { lockScroll: false });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (groups.length === 0) return null;
  return (
    <div ref={rootRef} className="relative ml-auto">
      <Button
        size="sm"
        variant="surface"
        aria-label="Другие действия"
        aria-haspopup="menu"
        aria-expanded={open}
        icon={<MoreHorizontal className="h-4 w-4" />}
        iconRight={<ChevronUp className={cn("h-3.5 w-3.5 transition-transform", !open && "rotate-180")} />}
        onClick={() => setOpen((o) => !o)}
      >
        Ещё
      </Button>
      {open && (
        <div
          role="menu"
          className="elevated absolute bottom-full right-0 z-[155] mb-2 w-[min(280px,calc(100vw-32px))] rounded-[var(--r-md)] p-1.5"
        >
          <MenuGroups
            groups={groups}
            busyKey={busyKey}
            onPick={(run) => {
              setOpen(false);
              run();
            }}
          />
        </div>
      )}
    </div>
  );
}
