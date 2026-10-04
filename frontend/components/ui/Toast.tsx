"use client";

/** ChiSetup toast — raised graphite card, hairline border, green check. */
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
          className="font-display fixed inset-x-0 z-[60] mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-3 text-[14px] font-semibold text-[var(--ink)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.7)]"
          style={{ bottom: "calc(110px + var(--safe-bottom))" }}
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
