"use client";

/** Подтверждения покупательских приложений: небольшой центрированный диалог. Подписи по умолчанию задаёт приложение (i18n). */
import { AnimatePresence, motion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "../overlay/overlay-stack";
import { backdropVariants, modalVariants } from "../overlay/variants";
import { Button } from "../primitives/Button";
import { answerConfirm, getPendingConfirm, subscribeConfirm, type PendingConfirm } from "./confirm-store";

export interface ConfirmLabels {
  confirm: string;
  cancel: string;
}

function usePending(): PendingConfirm | null {
  return useSyncExternalStore(subscribeConfirm, getPendingConfirm, () => null);
}

export function CustomerConfirmHost({ labels }: { labels: ConfirmLabels }) {
  const pending = usePending();
  const open = pending !== null;
  useOverlayLayer(open, () => answerConfirm(false));
  if (typeof document === "undefined") return null;
  const options = pending?.options;
  return createPortal(
    <AnimatePresence>
      {options && (
        <motion.div
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={() => answerConfirm(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4"
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface)] p-5"
          >
            <h2 className="font-display text-[16px] font-extrabold uppercase tracking-[0.04em] text-[var(--ink)]">{options.title}</h2>
            {options.message && <div className="mt-2 text-[14px] leading-snug text-[var(--muted)]">{options.message}</div>}
            <div className="mt-5 flex gap-2">
              <Button variant="surface" fullWidth onClick={() => answerConfirm(false)}>
                {options.cancelLabel ?? labels.cancel}
              </Button>
              <Button variant="accent" fullWidth onClick={() => answerConfirm(true)} autoFocus>
                {options.confirmLabel ?? labels.confirm}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
