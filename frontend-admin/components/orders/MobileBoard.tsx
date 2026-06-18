"use client";

/**
 * MobileBoard — board fallback for narrow screens (design doc §6ter.3):
 * horizontal status segment-control + vertical card list. Status change via a
 * "Переместить в…" bottom-sheet instead of drag.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeft } from "lucide-react";
import type { BoardDto, OrderStatus } from "@/lib/api";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  STATUS_EMOJI,
  STATUS_VAR,
  allowedTargets,
} from "@/lib/orders";
import { OrderCard } from "./OrderCard";
import { GlassButton } from "@/components/ui/GlassButton";

interface Props {
  board: BoardDto;
  onOpen: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
}

export function MobileBoard({ board, onOpen, onMove }: Props) {
  const [active, setActive] = useState<OrderStatus>("NEW");
  const [moveFor, setMoveFor] = useState<{ id: string; from: OrderStatus } | null>(null);

  const orders = board.columns[active] ?? [];

  return (
    <div>
      {/* Segment control */}
      <div className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
        {STATUS_ORDER.map((s) => {
          const count = board.counts?.[s] ?? board.columns[s]?.length ?? 0;
          const on = s === active;
          return (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`flex shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                on
                  ? "text-[var(--accent-ink)] [background:var(--accent)]"
                  : "glass text-[var(--text-muted)]"
              }`}
            >
              {STATUS_EMOJI[s]} {STATUS_LABEL[s]}
              <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {orders.length === 0 && (
          <div className="rounded-[var(--r-md)] border border-dashed border-white/10 px-3 py-8 text-center text-[13px] text-[var(--text-faint)]">
            Пусто
          </div>
        )}
        {orders.map((o) => (
          <div key={o.id} className="relative">
            <OrderCard order={o} onClick={() => onOpen(o.id)} />
            {allowedTargets(o.status).length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMoveFor({ id: o.id, from: o.status });
                }}
                className="glass absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)]"
                aria-label="Переместить"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Move bottom-sheet */}
      <AnimatePresence>
        {moveFor && (
          <motion.div
            className="fixed inset-0 z-[75] flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMoveFor(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="glass glass--strong relative z-10 w-full rounded-t-[var(--r-lg)] p-5"
              style={{ paddingBottom: "calc(20px + var(--safe-bottom))" }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <h3 className="mb-3 text-[15px] font-semibold text-[var(--text)]">
                Переместить в…
              </h3>
              <div className="flex flex-col gap-2">
                {allowedTargets(moveFor.from).map((t) => (
                  <GlassButton
                    key={t}
                    variant={t === "REJECTED" ? "danger" : "glass"}
                    fullWidth
                    onClick={() => {
                      onMove(moveFor.id, moveFor.from, t);
                      setMoveFor(null);
                    }}
                  >
                    {STATUS_EMOJI[t]} {STATUS_LABEL[t]}
                  </GlassButton>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
