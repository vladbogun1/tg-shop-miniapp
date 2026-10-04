"use client";

/**
 * One row of «Внимание»: what, which order/product, how long it waits, the main action and
 * «Отложить» (+ «Разобрано» for informational rows).
 * Desktop: actions inline on the right, «Отложить ▾» opens a small menu.
 * Phone: the main action full width + «⋯» (bottom sheet with the snooze options) — 44 px targets.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Clock,
  ClipboardList,
  MessageCircle,
  MoreHorizontal,
  Package,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionSheet, type SheetAction } from "@/components/orders/ActionSheet";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { OrderStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatWait, SNOOZE_OPTIONS, type InboxItem, type InboxType, type SnoozePreset } from "@/lib/inbox";
import { money } from "@/lib/money";

const PRIMARY: Record<InboxType, { label: string; icon: LucideIcon }> = {
  PAYMENT: { label: "Проверить оплату", icon: Wallet },
  CHAT: { label: "Ответить", icon: MessageCircle },
  NEW_STALE: { label: "Открыть заказ", icon: ClipboardList },
  APPROVED_STALE: { label: "Открыть заказ", icon: ClipboardList },
  RETURN: { label: "Открыть заказ", icon: ClipboardList },
  LOW_STOCK: { label: "Открыть товар", icon: Package },
  SITE_ERROR: { label: "Повторить", icon: RefreshCw },
};

const ORDER_STATUSES = new Set(["NEW", "APPROVED", "SHIPPED", "DELIVERED", "REJECTED"]);

export function InboxRow({
  item,
  dismissible,
  isDesktop,
  busy,
  onPrimary,
  onSnooze,
  onDismiss,
}: {
  item: InboxItem;
  dismissible: boolean;
  isDesktop: boolean;
  /** The main action is running (site rebuild). */
  busy?: boolean;
  onPrimary: (item: InboxItem) => void;
  onSnooze: (item: InboxItem, preset: SnoozePreset) => void;
  onDismiss: (item: InboxItem) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const primary = PRIMARY[item.type];
  const PrimaryIcon = primary.icon;

  const sheetActions: SheetAction[] = [
    ...SNOOZE_OPTIONS.map((o) => ({
      key: o.value,
      label: `Отложить: ${o.label.toLowerCase()}`,
      icon: <Clock className="h-4 w-4" />,
      onSelect: () => {
        setSheet(false);
        onSnooze(item, o.value);
      },
    })),
    ...(dismissible
      ? [
          {
            key: "dismiss",
            label: "Разобрано",
            icon: <Check className="h-4 w-4" />,
            onSelect: () => {
              setSheet(false);
              onDismiss(item);
            },
          },
        ]
      : []),
  ];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className="list-none"
    >
      <div
        className={cn(
          "flex flex-col gap-3 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-3 lg:flex-row lg:items-center lg:gap-4 lg:p-3.5",
          // Overdue: a red stripe inside the card (a thicker border would squeeze the buttons on a phone).
          item.overdue
            ? "shadow-[inset_6px_0_0_var(--danger),4px_4px_0_var(--shadow)] lg:pl-5"
            : "shadow-[4px_4px_0_var(--shadow)]"
        )}
      >
        {/* What + which + how long. Clicking it does the main action, like the button. */}
        <button
          type="button"
          onClick={() => onPrimary(item)}
          className="focusable min-w-0 flex-1 rounded-[var(--r-sm)] text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {item.shortId && (
              <span className="rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--text)]">
                #{item.shortId}
              </span>
            )}
            {item.status && ORDER_STATUSES.has(item.status) && <StatusBadge status={item.status as OrderStatus} />}
            {item.since && <WaitChip minutes={item.waitMinutes} overdue={item.overdue} />}
            {item.unread != null && item.unread > 0 && (
              <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--accent)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]">
                {item.unread > 99 ? "99+" : item.unread}
              </span>
            )}
          </div>
          <div className="mt-1.5 truncate text-[15px] font-extrabold text-[var(--text)]">{item.title}</div>
          {item.subtitle && (
            <div className="mt-0.5 line-clamp-2 break-words text-[13px] leading-snug text-[var(--text-muted)]">
              {item.subtitle}
            </div>
          )}
          {item.amountMinor != null && (
            <div className="mt-1 text-[13px] text-[var(--text-muted)]">
              <b className="font-black text-[var(--text)]">{money(item.amountMinor)}</b>
              {item.amountNote && <span> · {item.amountNote}</span>}
            </div>
          )}
        </button>

        {/* Actions */}
        {isDesktop ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="accent"
              size="md"
              loading={busy}
              icon={<PrimaryIcon className="h-4 w-4" />}
              onClick={() => onPrimary(item)}
            >
              {primary.label}
            </Button>
            <SnoozeMenu onPick={(p) => onSnooze(item, p)} />
            {dismissible && (
              <Button variant="outline" size="md" icon={<Check className="h-4 w-4" />} onClick={() => onDismiss(item)}>
                Разобрано
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            <Button
              variant="accent"
              size="lg"
              className="min-w-0 flex-1"
              loading={busy}
              icon={<PrimaryIcon className="h-4 w-4" />}
              onClick={() => onPrimary(item)}
            >
              {primary.label}
            </Button>
            {dismissible && (
              <Button
                variant="outline"
                size="lg"
                className="w-12 px-0"
                aria-label="Разобрано"
                title="Разобрано"
                icon={<Check className="h-5 w-5" />}
                onClick={() => onDismiss(item)}
              />
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-12 px-0"
              aria-label="Отложить"
              title="Отложить"
              icon={<MoreHorizontal className="h-5 w-5" />}
              onClick={() => setSheet(true)}
            />
            <ActionSheet open={sheet} title={item.title} actions={sheetActions} onClose={() => setSheet(false)} />
          </div>
        )}
      </div>
    </motion.li>
  );
}

function WaitChip({ minutes, overdue }: { minutes: number; overdue: boolean }) {
  return (
    <span
      title="Сколько ждёт"
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] px-1.5 py-0.5 text-[11px] font-bold",
        overdue ? "bg-[var(--danger)] text-[var(--accent-ink)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
      )}
    >
      <Clock className="h-3 w-3" />
      {formatWait(minutes)}
    </span>
  );
}

/** «Отложить ▾» with the three presets (desktop). Esc / a click outside closes it. */
function SnoozeMenu({ onPick }: { onPick: (p: SnoozePreset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="md"
        icon={<Clock className="h-4 w-4" />}
        iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Отложить
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-48 flex-col overflow-hidden rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[4px_4px_0_var(--shadow)]"
          >
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(o.value);
                }}
                className="px-3.5 py-2.5 text-left text-[13px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] focus-visible:outline-none"
              >
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
