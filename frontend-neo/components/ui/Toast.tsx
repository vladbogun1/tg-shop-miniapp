"use client";

/** NEO-BRUTALISM toast — bordered card with hard shadow, accent check. */
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed inset-x-0 z-[60] mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[14px] font-extrabold uppercase tracking-wide text-[var(--ink)] shadow-[5px_5px_0_var(--shadow)]"
          style={{ bottom: "calc(110px + var(--safe-bottom))" }}
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
