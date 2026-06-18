"use client";

/**
 * Modal — glass dialog. Desktop: centered floating card. Mobile: full-screen
 * sheet (design doc §8bis.2 "modalki -> full-screen na telefone").
 */
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** widen the desktop card */
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className={`glass glass--floating glass--strong relative z-10 flex w-full flex-col sm:rounded-[var(--r-lg)] ${
              wide ? "sm:max-w-3xl" : "sm:max-w-lg"
            } sm:max-h-[90vh]`}
          >
            {title && (
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/10"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="thin-scroll flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
