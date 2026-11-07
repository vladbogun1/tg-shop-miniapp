"use client";

/**
 * Меню «⋯» строки товара: Редактировать · Оформить с ИИ (черновик) · В архив. На телефоне — нижняя шторка
 * (`ActionSheet`), от 640 px — выпадающее меню у кнопки (закрывается по Esc, нажатию снаружи, прокрутке и смене размера).
 * В архиве вместо меню — кнопка «Восстановить».
 */
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Wand2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@shop/ui/admin-button";
import { useOverlayLayer } from "@shop/ui/overlay";
import { useMediaQuery } from "@shop/ui/use-media";
import { ActionSheet, type SheetAction } from "@/components/ui/ActionSheet";
import { cn } from "@/lib/cn";
import { useCloseOnAnchorMove } from "@/lib/use-close-on-anchor-move";
import { isUnfinished } from "../../model/stock";
import type { AdminProduct } from "../../model/types";
import { IconBtn } from "./RowBits";

export interface RowActionsProps {
  p: AdminProduct;
  archivedView: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onArchive: (archived: boolean) => void;
}

/** «Оформить с ИИ» нужен черновику и только что созданному (короткой формой) товару. */
export const needsCompletion = (p: AdminProduct): boolean => isUnfinished(p) || (p.cardStatus ?? "DRAFT") === "DRAFT";

function items({ p, onEdit, onComplete, onArchive }: RowActionsProps): SheetAction[] {
  return [
    ...(needsCompletion(p) ? [{ key: "ai", label: "Оформить с ИИ", icon: <Wand2 className="h-4 w-4" />, onSelect: onComplete }] : []),
    { key: "edit", label: "Редактировать", icon: <Pencil className="h-4 w-4" />, onSelect: onEdit },
    { key: "archive", label: "В архив", icon: <Archive className="h-4 w-4" />, danger: true, onSelect: () => onArchive(true) },
  ];
}

function DesktopMenu({ actions, anchor, onClose }: { actions: SheetAction[]; anchor: HTMLElement; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useOverlayLayer(true, onClose, { lockScroll: false });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = actions.length * 40 + 8;
    const below = window.innerHeight - r.bottom - 8 >= h;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - h - 4), left: Math.max(8, Math.min(r.right - 176, window.innerWidth - 184)) });
  }, [anchor, actions.length]);

  useEffect(() => {
    const out = (e: Event) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, [anchor, onClose]);
  useCloseOnAnchorMove(true, () => anchor, onClose);

  if (!pos) return null;
  return createPortal(
    <div ref={ref} role="menu" style={{ top: pos.top, left: pos.left }} className="elevated fixed z-[150] w-44 overflow-hidden p-1">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            a.onSelect();
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)]",
            a.danger ? "text-[var(--danger-ink)]" : a.key === "ai" && "text-[var(--accent-hi)]"
          )}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

export function RowActions(props: RowActionsProps) {
  const { p, archivedView, onArchive } = props;
  const phone = useMediaQuery("(max-width: 639px)", false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);

  if (archivedView) {
    return (
      <Button size="sm" variant="surface" icon={<ArchiveRestore className="h-4 w-4" />} onClick={(e) => (e.stopPropagation(), onArchive(false))}>
        Восстановить
      </Button>
    );
  }
  const actions = items(props);
  return (
    <span ref={btnRef} className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <IconBtn label="Действия" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-4 w-4" />
      </IconBtn>
      {phone ? (
        <ActionSheet open={open} title={p.title} actions={actions} onClose={() => setOpen(false)} />
      ) : (
        open && btnRef.current && <DesktopMenu actions={actions} anchor={btnRef.current} onClose={() => setOpen(false)} />
      )}
    </span>
  );
}
