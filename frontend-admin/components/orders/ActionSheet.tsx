"use client";

/** Bottom sheet with a list of actions (mobile "⋯" menus). Esc / backdrop / an action close it. */
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { backdropVariants } from "@/lib/motion";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { Button } from "@/components/ui/Button";

export interface SheetAction {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function ActionSheet({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title?: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  useOverlayLayer(open, onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[160] flex items-end">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="elevated relative z-10 w-full rounded-t-[var(--r-xl)] rounded-b-none border-x-0 border-b-0 px-4 pt-3"
            style={{ paddingBottom: "calc(20px + var(--safe-bottom, 0px))" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line-strong)]" />
            {title && (
              <h3 className="font-display mb-3 truncate text-[15px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">{title}</h3>
            )}
            <div className="flex flex-col gap-2">
              {actions.map((a) => (
                <Button
                  key={a.key}
                  variant={a.danger ? "danger" : "surface"}
                  className="w-full justify-start"
                  icon={a.icon}
                  disabled={a.disabled}
                  onClick={() => {
                    onClose();
                    a.onSelect();
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
