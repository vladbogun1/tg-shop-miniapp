"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { backdropVariants, drawerVariants } from "@/lib/motion";

/**
 * Right-side drawer. `zClass` lets callers stack drawers (e.g. order drawer over
 * a user profile drawer) by passing a higher z-index utility.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
  zClass = "z-[120]",
  header,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  width?: string;
  zClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0", zClass)}>
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          <motion.aside
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "absolute inset-y-0 right-0 flex w-full flex-col border-l-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-3)]",
              width
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--line)] px-5 py-4">
              {header ?? <div className="text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">{title}</div>}
              <button
                onClick={onClose}
                className="nb-press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-[2px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
