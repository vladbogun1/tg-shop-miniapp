"use client";

/** Phone, inside a status: «‹ Отправлен  13 · 15 030 ₴» — sits in the screen's sticky panel. */
import { ChevronLeft } from "lucide-react";
import { money } from "@/lib/money";
import type { AdminBoard } from "../../api";
import { columnTotal } from "../../model/board";
import { BOARD_LABEL, BOARD_VAR, RETURNING, returningMinor, type BoardKey } from "../../model/status";
import { ATTENTION } from "./StatusList";

const countOf = (board: AdminBoard, s: BoardKey) => board.counts?.[s] ?? board.columns[s]?.length ?? 0;

/** Count and money of one status; `board` comes already filtered («только оплаченные новые» drops the server sums — then the cards are added up). */
function totals(board: AdminBoard, active: BoardKey): { count: number; sum: number; elsewhere: number } {
  const cards = board.columns[active] ?? [];
  const sum = active === RETURNING ? cards.reduce((a, o) => a + returningMinor(o), 0) : columnTotal(cards, board.sums?.[active]);
  // Like the unread counter on a chat's «back»: what waits in the OTHER needs-attention statuses.
  const elsewhere = ATTENTION.filter((s) => s !== active).reduce((a, s) => a + countOf(board, s), 0);
  return { count: countOf(board, active), sum, elsewhere };
}

function BackButton({ elsewhere, onBack }: { elsewhere: number; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={elsewhere > 0 ? `К списку статусов, ещё ${elsewhere} ждут` : "К списку статусов"}
      className="nb-press hit relative -ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--text)]"
    >
      <ChevronLeft className="h-6 w-6" />
      {elsewhere > 0 && (
        <span aria-hidden className="tabular absolute right-0 top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[#121212]">
          {elsewhere}
        </span>
      )}
    </button>
  );
}

export function StatusHeader({ board, active, onBack }: { board: AdminBoard | undefined; active: BoardKey; onBack: () => void }) {
  const t = board ? totals(board, active) : undefined;
  return (
    <div className="flex h-12 items-center gap-1 border-b border-[var(--line)]">
      <BackButton elsewhere={t?.elsewhere ?? 0} onBack={onBack} />
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: BOARD_VAR[active] }} />
      <h2 className="m-0 min-w-0 flex-1 truncate text-[16px] font-semibold text-[var(--text)]">{BOARD_LABEL[active]}</h2>
      {t && (
        <span className="tabular shrink-0 text-[12.5px] text-[var(--text-muted)]">
          {t.count}
          {t.count > 0 ? ` · ${money(t.sum, "UAH")}` : ""}
        </span>
      )}
    </div>
  );
}
