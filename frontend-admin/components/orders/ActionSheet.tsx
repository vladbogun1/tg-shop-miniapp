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
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="elevated relative z-10 w-full border-x-0 border-b-0 p-5"
            style={{ paddingBottom: "calc(20px + var(--safe-bottom, 0px))" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border-strong)]" />
            {title && (
              <h3 className="mb-3 text-[15px] font-black uppercase tracking-wide text-[var(--text)]">{title}</h3>
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
