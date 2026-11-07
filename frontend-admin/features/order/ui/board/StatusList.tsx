"use client";

/**
 * Phone: the board as a list of statuses, like a chat list. One row per status — a coloured circle,
 * the name, the sum, a counter and a line about the newest order. A tap opens the status (MobileBoard).
 * Needs-attention statuses (new, approved, on the way back) carry an orange counter.
 */
import { ChevronRight, CircleCheck, Inbox, Package, Sparkles, Truck, Undo2, X } from "lucide-react";
import type { ComponentType } from "react";
import { money } from "@/lib/money";
import type { AdminBoard } from "../../api";
import { isClosedColumn } from "../../model/board";
import { BOARD_LABEL, BOARD_ORDER, BOARD_VAR, RETURNING, returningMinor, type BoardKey } from "../../model/status";

const ICON: Record<BoardKey, ComponentType<{ className?: string }>> = {
  NEW: Sparkles,
  APPROVED: CircleCheck,
  SHIPPED: Truck,
  DELIVERED: Package,
  [RETURNING]: Undo2,
  REJECTED: X,
};
/** Statuses that need the admin's hands; their counters are orange (and summed on «‹» inside a status). */
export const ATTENTION: BoardKey[] = ["NEW", "APPROVED", RETURNING];

function sumOf(board: AdminBoard, key: BoardKey): number | undefined {
  if (key === RETURNING) return (board.columns[key] ?? []).reduce((acc, o) => acc + returningMinor(o), 0);
  return board.sums?.[key];
}

function previewOf(board: AdminBoard, key: BoardKey): string {
  const first = (board.columns[key] ?? [])[0];
  if (!first) return "Пока пусто";
  const minor = key === RETURNING ? returningMinor(first) : first.totalMinor;
  return `${first.customerName || "Без имени"}, ${money(minor, first.currency)}`;
}

interface RowProps {
  board: AdminBoard;
  statusKey: BoardKey;
  /** Closed statuses count only the chosen period — say which, or «12» reads as all-time. */
  period: string;
  onPick: (s: BoardKey) => void;
}

function Row({ board, statusKey, period, onPick }: RowProps) {
  const Icon = ICON[statusKey] ?? Inbox;
  const count = board.counts?.[statusKey] ?? board.columns[statusKey]?.length ?? 0;
  const sum = sumOf(board, statusKey);
  const hot = count > 0 && ATTENTION.includes(statusKey);
  return (
    <li>
      <button type="button" onClick={() => onPick(statusKey)} className="nb-press flex w-full min-w-0 items-center gap-3 border-t border-[var(--line)] px-1 py-3 text-left first:border-t-0">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ color: BOARD_VAR[statusKey] }}>
          <span aria-hidden className="absolute inset-0 rounded-full bg-current opacity-[0.16]" />
          <Icon className="relative h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold text-[var(--text)]">{BOARD_LABEL[statusKey]}</span>
            {sum != null && count > 0 && <span className="tabular shrink-0 text-[12px] text-[var(--text-muted)]">{money(sum, "UAH")}</span>}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-[var(--text-muted)]">
            {isClosedColumn(statusKey) && <span className="text-[var(--text-faint)]">{period} · </span>}
            {previewOf(board, statusKey)}
          </span>
        </span>
        <span
          className={
            "tabular grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold " +
            (hot ? "bg-[var(--accent)] text-[#121212]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")
          }
        >
          {count}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
      </button>
    </li>
  );
}

export function StatusList({ board, period, onPick }: { board: AdminBoard; period: string; onPick: (s: BoardKey) => void }) {
  return (
    <ul className="m-0 list-none p-0">
      {BOARD_ORDER.map((s) => (
        <Row key={s} board={board} statusKey={s} period={period} onPick={onPick} />
      ))}
    </ul>
  );
}
