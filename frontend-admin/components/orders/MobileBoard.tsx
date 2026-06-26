"use client";

/**
 * MobileBoard — board fallback for narrow screens: a horizontal status
 * SegmentedControl + vertical card list. Status change happens via a
 * "Переместить в…" spring bottom-sheet instead of drag.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeft, Inbox } from "lucide-react";
import type { BoardDto, OrderStatus } from "@/lib/api";
import {
  STATUS_ORDER,
  STATUS_LABEL,
  STATUS_EMOJI,
  allowedTargets,
} from "@/lib/orders";
import { staggerContainer, riseItem, backdropVariants } from "@/lib/motion";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { OrderCard } from "./OrderCard";

interface Props {
  board: BoardDto;
  onOpen: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
}

export function MobileBoard({ board, onOpen, onMove }: Props) {
  const [active, setActive] = useState<OrderStatus>("NEW");
  const [moveFor, setMoveFor] = useState<{ id: string; from: OrderStatus } | null>(
    null
  );

  const orders = board.columns[active] ?? [];

  const segOptions = STATUS_ORDER.map((s) => ({
    value: s,
    label: `${STATUS_EMOJI[s]} ${STATUS_LABEL[s]}`,
    count: board.counts?.[s] ?? board.columns[s]?.length ?? 0,
  }));

  return (
    <div>
      {/* Status tabs */}
      <div className="thin-scroll -mx-1 mb-3 overflow-x-auto px-1 pb-1">
        <SegmentedControl
          options={segOptions}
          value={active}
          onChange={setActive}
        />
      </div>

      <motion.div
        key={active}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="flex flex-col gap-2.5"
      >
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--r-md)] border-2 border-dashed border-[var(--border-2)] px-3 py-10 text-center text-[13px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            <Inbox className="h-6 w-6 opacity-60" />
            Пусто
          </div>
        ) : (
          orders.map((o) => (
            <motion.div key={o.id} variants={riseItem} className="relative">
              <OrderCard order={o} onClick={() => onOpen(o.id)} />
              {allowedTargets(o.status).length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoveFor({ id: o.id, from: o.status });
                  }}
                  className="nb-press absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-hover)]"
                  aria-label="Переместить"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Move bottom-sheet */}
      <AnimatePresence>
        {moveFor && (
          <div className="fixed inset-0 z-[150] flex items-end">
            <motion.div
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 bg-black/55"
              onClick={() => setMoveFor(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="elevated relative z-10 w-full border-x-0 border-b-0 p-5"
              style={{ paddingBottom: "calc(20px + var(--safe-bottom))" }}
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border-strong)]" />
              <h3 className="mb-3 text-[15px] font-black uppercase tracking-wide text-[var(--text)]">
                Переместить в…
              </h3>
              <div className="flex flex-col gap-2">
                {allowedTargets(moveFor.from).map((t) => (
                  <Button
                    key={t}
                    variant={t === "REJECTED" ? "danger" : "surface"}
                    className="w-full justify-start"
                    onClick={() => {
                      onMove(moveFor.id, moveFor.from, t);
                      setMoveFor(null);
                    }}
                  >
                    {STATUS_EMOJI[t]} {STATUS_LABEL[t]}
                  </Button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
