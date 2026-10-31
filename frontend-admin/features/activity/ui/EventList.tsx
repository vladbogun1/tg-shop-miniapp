"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { customerLabel, errorLabel, recipientText, resultLabel, sourceLabel, typeLabel } from "../model/labels";
import { resultTone } from "../model/tone";
import type { ActivityRow } from "../model/types";
import { EventDetails } from "./EventDetails";
import { sourceIcon } from "./source-icon";
import type { RowActions } from "./use-row-actions";

/** Строки журнала; открыта может быть одна. */
export function EventList({ rows, actions, compact }: { rows: ActivityRow[]; actions: RowActions; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className={cn("card overflow-hidden p-0", compact && "!rounded-[var(--r-md)]")}>
      <ul className="divide-y divide-[var(--line)]">
        {rows.map((r) => (
          <EventRow
            key={r.id}
            r={r}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            actions={actions}
          />
        ))}
      </ul>
    </div>
  );
}

function EventRow({ r, open, onToggle, actions }: { r: ActivityRow; open: boolean; onToggle: () => void; actions: RowActions }) {
  const Icon = sourceIcon(r.source);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hit grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-2)] md:grid-cols-[132px_auto_minmax(0,1fr)_auto_auto]"
      >
        <span className="tabular hidden whitespace-nowrap pt-0.5 text-[12px] text-[var(--text-muted)] md:block">
          {formatDateTime(r.createdAt)}
        </span>
        <span
          className="mt-0.5 grid h-7 w-7 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-3)] text-[var(--text-muted)]"
          title={sourceLabel(r.source)}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <EventHeadline r={r} open={open} />
        <ResultCell r={r} />
        <ChevronDown
          className={cn(
            "mt-1 hidden h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform md:block",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <EventDetails r={r} actions={actions} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Название события, кому, заказ, краткое содержание (на узком экране — ещё дата и источник). */
function EventHeadline({ r, open }: { r: ActivityRow; open: boolean }) {
  const who = customerLabel(r);
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-[var(--text)]">{typeLabel(r.type)}</span>
        {r.recipient && <span className="text-[12px] text-[var(--text-faint)]">→ {recipientText(r.recipient, who)}</span>}
        {!r.recipient && who && <span className="text-[12px] text-[var(--text-faint)]">· {who}</span>}
        {r.orderId && <span className="font-mono text-[11.5px] text-[var(--text-faint)]">#{r.orderId.slice(0, 8)}</span>}
      </span>
      {r.summary && (
        <span className={cn("mt-0.5 text-[12.5px] text-[var(--text-muted)]", open ? "block" : "line-clamp-1")}>
          {r.summary}
        </span>
      )}
      <span className="tabular mt-0.5 block text-[11.5px] text-[var(--text-faint)] md:hidden">
        {formatDateTime(r.createdAt)} · {sourceLabel(r.source)}
      </span>
    </span>
  );
}

function ResultCell({ r }: { r: ActivityRow }) {
  return (
    <span className="col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:justify-end">
      <Badge tone={resultTone(r.result)} dot>
        {resultLabel(r.result, r.source)}
      </Badge>
      {r.errorCode && r.result !== "OK" && (
        <span className={cn("text-[11.5px] font-semibold", r.result === "FAILED" ? "text-[#F87171]" : "text-[var(--warn)]")}>
          {errorLabel(r.errorCode)}
        </span>
      )}
    </span>
  );
}
