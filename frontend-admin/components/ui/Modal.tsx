"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { backdropVariants, modalVariants, sheetVariants } from "@/lib/motion";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { useMediaQuery } from "@/lib/use-media";
import { Button } from "./Button";

/**
 * Close request of the nearest Modal — goes through the `dirty` guard. Footer buttons get it via
 * {@link useModalClose} / {@link ModalCancel}, so "Отмена" asks the same question as Esc and ×.
 */
const ModalCloseContext = createContext<(() => void) | null>(null);

/** The guarded close of the enclosing Modal (falls back to a no-op outside one). */
export function useModalClose(): () => void {
  return useContext(ModalCloseContext) ?? (() => {});
}

/** "Отмена" for a modal footer: closes through the dirty guard. */
export function ModalCancel({ children = "Отмена", disabled }: { children?: ReactNode; disabled?: boolean }) {
  const close = useModalClose();
  return (
    <Button variant="ghost" onClick={close} disabled={disabled}>
      {children}
    </Button>
  );
}

/**
 * Centered dialog.
 *
 * Forms pass `closeOnBackdrop={false}` (a stray click outside must not throw away what was typed)
 * and `dirty` (Esc / × / backdrop / {@link ModalCancel} then ask "Закрыть без сохранения?").
 * Esc closes only the topmost overlay (see lib/overlay-stack).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  fixedHeight = false,
  dirty = false,
  dirtyMessage = "Введённые данные пропадут.",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false for forms: a stray click outside must not throw away what was typed. */
  closeOnBackdrop?: boolean;
  /** Same height on every step of a wizard, so the footer buttons don't jump under the cursor. */
  fixedHeight?: boolean;
  /** Unsaved input: closing asks for confirmation first. */
  dirty?: boolean;
  /** Body of the "Закрыть без сохранения?" question. */
  dirtyMessage?: string;
}) {
  // Close only when the press also STARTED on the backdrop — a text selection dragged out of an
  // input and released over the backdrop is not a click outside.
  const pressedOnBackdrop = useRef(false);
  const [askClose, setAskClose] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setAskClose(true);
    else onClose();
  }, [dirty, onClose]);

  useOverlayLayer(open, requestClose);
  // A pending "close without saving?" must not reappear on the next open.
  useEffect(() => {
    if (!open) setAskClose(false);
  }, [open]);

  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";
  const dialog = useMediaQuery("(min-width: 640px)", true);

  if (typeof document === "undefined") return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            // Phone: a full-width bottom sheet (footer under the thumb, room for the keyboard);
            // from sm up: the centred dialog.
            <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center sm:p-4">
              <motion.div
                variants={backdropVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onMouseDown={(e) => (pressedOnBackdrop.current = e.target === e.currentTarget)}
                onClick={() => {
                  if (closeOnBackdrop && pressedOnBackdrop.current) requestClose();
                  pressedOnBackdrop.current = false;
                }}
                className="absolute inset-0 bg-black/50"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                variants={dialog ? modalVariants : sheetVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className={cn(
                  "panel card-sheen relative z-10 flex w-full flex-col overflow-hidden",
                  "max-h-[calc(100dvh-var(--safe-top)-12px)] sm:max-h-[90dvh]",
                  "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:shadow-[0_-5px_0_var(--shadow)]",
                  fixedHeight && "h-[min(calc(100dvh-var(--safe-top)-12px),680px)] sm:h-[min(90dvh,680px)]",
                  width
                )}
              >
                <ModalCloseContext.Provider value={requestClose}>
                  {title && (
                    <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--line)] px-5 py-4">
                      <div className="min-w-0 text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">
                        {title}
                      </div>
                      <button
                        onClick={requestClose}
                        aria-label="Закрыть"
                        className="nb-press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-[2px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] pointer-coarse:h-11 pointer-coarse:w-11"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                  <div
                    className={cn(
                      "thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4 sm:px-5",
                      !footer && "max-sm:pb-[calc(16px+var(--safe-bottom))]"
                    )}
                  >
                    {children}
                  </div>
                  {footer && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t-[3px] border-[var(--line)] px-4 pb-[calc(12px+var(--safe-bottom))] pt-3 sm:px-5 sm:py-4">
                      {footer}
                    </div>
                  )}
                </ModalCloseContext.Provider>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
      {/* Rendered after the dialog, so its portal sits on top of it. Only for dirty-guarded
          modals — the confirm itself is never dirty, which is what ends the recursion. */}
      {(dirty || askClose) && (
      <Modal
        open={open && askClose}
        onClose={() => setAskClose(false)}
        title="Закрыть без сохранения?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAskClose(false)}>
              Вернуться
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setAskClose(false);
                onClose();
              }}
            >
              Закрыть
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--text-muted)]">{dirtyMessage}</p>
      </Modal>
      )}
    </>
  );
}
