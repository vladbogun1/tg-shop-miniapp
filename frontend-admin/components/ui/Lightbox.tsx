"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "@/lib/overlay-stack";

export function Lightbox({
  src,
  onClose,
  originalHref,
}: {
  src: string | null;
  onClose: () => void;
  originalHref?: string;
}) {
  // Esc closes the picture only — not the chat drawer underneath it.
  useOverlayLayer(!!src, onClose);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-[6px]"
          style={{
            paddingTop: "calc(72px + var(--safe-top))",
            paddingBottom: "calc(80px + var(--safe-bottom))",
            paddingLeft: "max(16px, var(--safe-left))",
            paddingRight: "max(16px, var(--safe-right))",
          }}
        >
          {/* Above the picture (z-10) and below the status bar of the installed iOS app: a tall
              receipt screenshot used to cover the cross, and there was no way out of the viewer. */}
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="nb-press absolute z-10 grid h-11 w-11 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]"
            style={{ top: "calc(14px + var(--safe-top))", right: "max(16px, var(--safe-right))" }}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              src={src}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-[var(--r-lg)] border border-[var(--line)] object-contain shadow-[var(--shadow-3)]"
            />
          </div>
          {/* Thumb-reach exit at the bottom too — on a phone the top corner is a stretch. */}
          <div
            className="absolute inset-x-0 z-10 flex justify-center gap-2.5 px-4"
            style={{ bottom: "calc(16px + var(--safe-bottom))" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="nb-press min-h-11 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text)]"
            >
              Закрыть
            </button>
            {originalHref && (
              <a
                href={originalHref}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="nb-press nb-accent grid min-h-11 place-items-center px-4 text-[12px] uppercase tracking-[0.06em]"
              >
                Открыть оригинал
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
