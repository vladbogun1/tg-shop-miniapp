"use client";

/** Toast (graphite card, hairline, soft depth). `toast("…")` from anywhere; one host in Providers. */
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { noFadeFlash } from "@/lib/motion";

interface ToastState {
  message: string | null;
  kind: "ok" | "error";
  id: number;
  show: (message: string, kind?: "ok" | "error") => void;
  hide: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  message: null,
  kind: "ok",
  id: 0,
  show: (message, kind = "ok") => set((s) => ({ message, kind, id: s.id + 1 })),
  hide: () => set({ message: null }),
}));

export function toast(message: string, kind: "ok" | "error" = "ok"): void {
  useToastStore.getState().show(message, kind);
}

export function ToastHost() {
  const { message, kind, id, hide } = useToastStore();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2600);
    return () => clearTimeout(t);
  }, [message, id, hide]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            key={id}
            {...noFadeFlash}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex max-w-[92vw] items-center gap-2.5 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-[14px] font-semibold text-[var(--ink)] shadow-[0_18px_40px_-14px_rgba(0,0,0,.8)]"
          >
            {kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.25} />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" strokeWidth={2.25} />
            )}
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
