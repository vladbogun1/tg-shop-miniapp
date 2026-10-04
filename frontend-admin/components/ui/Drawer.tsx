"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { backdropVariants, drawerVariants } from "@/lib/motion";
import { useOverlayLayer } from "@/lib/overlay-stack";

/**
 * Right-side drawer. `zClass` lets callers stack drawers (e.g. order drawer over
 * a user profile drawer) by passing a higher z-index utility. Esc closes it only when it is the
 * topmost overlay — a modal opened from inside the drawer gets the key first.
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
  useOverlayLayer(open, onClose);

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
            role="dialog"
            aria-modal="true"
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "absolute inset-y-0 right-0 flex w-full flex-col border-l-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-3)]",
              width
            )}
          >
            {/* min-w-0 on the header slot + shrink-0 on × : long badges wrap instead of pushing the
                close button off a phone screen. */}
            <div
              data-app-chrome
              className="flex items-start justify-between gap-3 border-b-[3px] border-[var(--line)] px-4 pb-3 pt-[calc(12px+var(--safe-top))] sm:px-5 sm:pb-4 sm:pt-[calc(16px+var(--safe-top))]"
            >
              <div className="min-w-0 flex-1">
                {header ?? (
                  <div className="text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">{title}</div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="nb-press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-[2px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* The content's own bottom bar (order actions, chat composer) pads for the home indicator. */}
            <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
