"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** Меню «⋯» экрана ревью: ручной путь, «Повторить тщательнее», «Отклонить», «Показать ответ», владельцу — промпт. */
export function ReviewMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Ещё действия"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="nb-press grid h-11 w-11 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <ul role="menu" className="absolute bottom-full right-0 z-20 mb-2 w-60 overflow-hidden rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-xl">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                role="menuitem"
                type="button"
                className={`block w-full px-3.5 py-3 text-left text-[13px] hover:bg-[var(--surface-2)] ${it.danger ? "text-[var(--danger-ink)]" : "text-[var(--text)]"}`}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
