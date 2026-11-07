"use client";

/**
 * Ячейка быстрой правки числа прямо в списке (цена, остаток): нажал → поле, Enter или уход фокуса — сохранить, Esc — откат.
 * На телефоне (< 640 px) то же самое открывается в нижней шторке с крупным полем и кнопкой «Сохранить».
 * Само сохранение — у вызывающего (`onSave`): он проверяет значение, спрашивает причину списания, разбирает 409.
 * `onSave` вернул false — правка не принята: с Enter поле остаётся (можно поправить), с уходом фокуса — откат.
 */
import { Pencil } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { useMediaQuery } from "@shop/ui/use-media";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { cn } from "@/lib/cn";

interface Props {
  /** Для чтения с экрана и заголовка шторки: «Цена», «Остаток». */
  label: string;
  /** Подпись товара в заголовке шторки. */
  subject: string;
  /** Что показано, пока не правят. */
  display: ReactNode;
  /** Значение в поле при открытии. */
  initial: string;
  inputMode: "numeric" | "decimal";
  /** «₴» / «шт» рядом с полем. */
  suffix: string;
  onSave: (raw: string) => Promise<boolean>;
  /** Править нельзя (остаток считается по вариантам): нажатие ведёт в окно товара. */
  locked?: { hint: string; onOpen: () => void };
  className?: string;
}

const PILL =
  "focusable inline-flex h-9 min-w-[64px] items-center justify-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 text-[13px] pointer-coarse:h-11 sm:rounded-[var(--r-sm)] sm:border-transparent sm:bg-transparent sm:px-2 sm:hover:border-[var(--line-strong)] sm:hover:bg-[var(--surface-2)]";

export function QuickCell({ label, subject, display, initial, inputMode, suffix, onSave, locked, className }: Props) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(initial);
  const [saving, setSaving] = useState(false);
  // Esc откатывает: потеря фокуса, которая за ним следует, не должна сохранять.
  const cancelled = useRef(false);
  const busy = useRef(false);

  function open() {
    cancelled.current = false;
    setRaw(initial);
    setEditing(true);
  }

  async function commit(fromBlur: boolean) {
    if (busy.current || cancelled.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const ok = await onSave(raw);
      if (ok || fromBlur) {
        // Поле закрыто: уход фокуса при его удалении из страницы не должен сохранять второй раз.
        cancelled.current = true;
        setEditing(false);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <button type="button" title={locked.hint} aria-label={`${label}: ${locked.hint}`} onClick={(e) => (e.stopPropagation(), locked.onOpen())} className={cn(PILL, "cursor-pointer", className)}>
        {display}
      </button>
    );
  }

  const trigger = (
    <button
      type="button"
      aria-label={`${label}: изменить`}
      title={`${label}: нажмите, чтобы изменить`}
      onClick={(e) => (e.stopPropagation(), open())}
      className={cn(PILL, "group cursor-text", className)}
    >
      {display}
      <Pencil aria-hidden className="hidden h-3 w-3 text-[var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </button>
  );

  if (phone) {
    return (
      <>
        {trigger}
        <ActionSheet open={editing} title={`${label} · ${subject}`} onClose={() => setEditing(false)}>
          <form
            className="flex flex-col gap-3 pb-1"
            onSubmit={(e) => {
              e.preventDefault();
              void commit(false);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 focus-within:border-[var(--accent)]">
              <input
                autoFocus
                aria-label={label}
                inputMode={inputMode}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                className="font-display tabular h-14 min-w-0 flex-1 bg-transparent text-[24px] font-bold text-[var(--text)] outline-none"
              />
              <span className="text-[14px] text-[var(--text-muted)]">{suffix}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
                Отмена
              </Button>
              <Button type="submit" variant="accent" className="flex-1" loading={saving}>
                Сохранить
              </Button>
            </div>
          </form>
        </ActionSheet>
      </>
    );
  }

  if (!editing) return trigger;
  return (
    <span className={cn("inline-flex h-9 items-center gap-1 pointer-coarse:h-11", className)} onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        aria-label={label}
        inputMode={inputMode}
        value={raw}
        disabled={saving}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(false);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelled.current = true;
            setEditing(false);
          }
        }}
        onBlur={() => void commit(true)}
        className="tabular h-full w-[76px] rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--surface-2)] px-2 text-right text-[13px] text-[var(--text)] shadow-[var(--ring-accent)] outline-none"
      />
      <span className="text-[11.5px] text-[var(--text-faint)]">{suffix}</span>
    </span>
  );
}
