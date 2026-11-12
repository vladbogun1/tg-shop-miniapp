"use client";

/**
 * Командная палитра (Ctrl/Cmd+K): переход к разделу по названию, а с двух символов — ещё поиск по заказам (номер,
 * телефон, имя), товарам (название, артикул) и покупателям (имя, @username, телефон): до пяти на группу, Enter
 * открывает выбранное. Разделы — из nav-config, данные — `GET /api/admin/search`.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropVariants, PresenceLayer, useOpenKey, useOverlayLayer } from "@shop/ui/overlay";
import { useIsSuperAdmin } from "@/features/staff";
import { cn } from "@/lib/cn";
import type { PaletteEntry } from "./palette-items";
import { usePaletteEntries } from "./use-palette-entries";

/** Кнопка в шапке + горячая клавиша. */
export function CommandPaletteButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Поиск: разделы, заказы, товары, покупатели"
        title="Поиск (Ctrl+K)"
        className="nb-press focusable flex h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] max-lg:w-10 max-lg:justify-center max-lg:px-0 pointer-coarse:h-11 pointer-coarse:max-lg:w-11 text-[var(--text-faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] lg:flex"
      >
        {/* Phone/tablet: just the magnifier — there is no keyboard for Ctrl K, so this is the only way in. */}
        <Search className="h-4 w-4" />
        <span className="max-lg:hidden">Поиск</span>
        <kbd className="tabular rounded max-lg:hidden border border-[var(--line)] px-1.5 text-[11px]">Ctrl K</kbd>
      </button>
      <PaletteDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PaletteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useOverlayLayer(open, onClose);
  const session = useOpenKey(open);
  const router = useRouter();
  const superAdmin = useIsSuperAdmin();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { entries: items, pending, failed } = usePaletteEntries(query, superAdmin);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      inputRef.current?.focus();
    }
  }, [open]);

  function go(i: number) {
    const it = items[i];
    if (!it) return;
    onClose();
    router.push(it.href);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(cursor);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <PresenceLayer key={session} name="command-palette" className="fixed inset-0 z-[170] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск по разделам, заказам, товарам и покупателям"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="elevated relative z-10 w-full max-w-[560px] overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Раздел, заказ, товар или покупатель"
                className="h-12 w-full bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              />
            </div>
            <ul role="listbox" className="thin-scroll max-h-[50vh] overflow-y-auto p-1.5">
              {items.length === 0 && (
                <li className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">{pending ? "Ищем…" : "Ничего не найдено"}</li>
              )}
              {items.map((it, i) => (
                <Fragment key={it.key}>
                  {it.found && items[i - 1]?.group !== it.group && (
                    <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                      {it.group}
                    </li>
                  )}
                  <PaletteRow it={it} active={i === cursor} onPick={() => go(i)} onHover={() => setCursor(i)} />
                </Fragment>
              ))}
              {pending && items.length > 0 && <li className="px-3 py-2 text-[12px] text-[var(--text-faint)]">Ищем заказы, товары и покупателей…</li>}
              {failed && <li className="px-3 py-2 text-[12px] text-[var(--danger-ink)]">Поиск по данным не ответил — разделы доступны</li>}
            </ul>
          </motion.div>
        </PresenceLayer>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PaletteRow({ it, active, onPick, onHover }: { it: PaletteEntry; active: boolean; onPick: () => void; onHover: () => void }) {
  const Icon = it.icon;
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onClick={onPick}
        onMouseMove={onHover}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] px-3 text-left text-[14px]",
          active ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "text-[var(--text)]",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--text-faint)]" />
        <span className="flex-1 truncate">{it.label}</span>
        <span className="max-w-[55%] truncate text-[11.5px] text-[var(--text-faint)]">{it.found ? it.hint : it.group}</span>
      </button>
    </li>
  );
}
