"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { backdropVariants, modalVariants } from "@/lib/motion";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "panel card-sheen relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden",
              width
            )}
          >
            {title && (
              <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--line)] px-5 py-4">
                <div className="text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">{title}</div>
                <button
                  onClick={onClose}
                  className="nb-press grid h-9 w-9 place-items-center rounded-[var(--r-sm)] border-[2px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="thin-scroll min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t-[3px] border-[var(--line)] px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
