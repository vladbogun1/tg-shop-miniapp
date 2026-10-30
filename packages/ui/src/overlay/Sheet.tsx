"use client";

/**
 * Нижний лист покупательских приложений: затемнение, «ручка», заголовок с крестиком, тело.
 * Участвует в общем стеке оверлеев (Esc закрывает только верхний, прокрутка страницы под ним заблокирована) и,
 * если задан `backClose`, закрывается кнопкой «Назад». Тело и его отступы — забота вызывающего.
 */
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "./overlay-stack";
import { useBackToClose } from "./use-back-close";

const sheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { type: "spring", stiffness: 320, damping: 34 } },
  exit: { y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  ariaLabel,
  backClose,
  zClass = "z-[130]",
  onCloseClick,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** aria-label крестика. */
  closeLabel: string;
  ariaLabel?: string;
  /** Маркер записи истории: пока лист открыт, «Назад» закрывает его, а не страницу. */
  backClose?: string;
  zClass?: string;
  /** Нажатие именно на крестик (например, лёгкая вибрация) — до закрытия. */
  onCloseClick?: () => void;
  children: ReactNode;
}) {
  const close = useBackToClose(open && !!backClose, onClose, { marker: backClose });
  useOverlayLayer(open, close);

  // In a portal: opened from a screen's own layer the sheet must still cover the tab bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={close}
          className={`fixed inset-0 flex items-end justify-center bg-black/65 ${zClass}`}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            variants={sheetVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[16px] border border-b-0 border-[var(--line-strong)] bg-[var(--surface)]"
          >
            <div className="flex justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-1.5">
              <h2 className="font-display flex min-w-0 items-center gap-2 text-[15px] font-extrabold uppercase leading-tight tracking-[0.04em] text-[var(--ink)]">
                {title}
              </h2>
              <button
                type="button"
                onClick={() => {
                  onCloseClick?.();
                  close();
                }}
                aria-label={closeLabel}
                className="tap -mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] active:scale-95"
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
