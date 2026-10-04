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
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-6 backdrop-blur-[6px]"
        >
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="nb-press absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-6 w-6" />
          </button>
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            src={src}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] rounded-[var(--r-lg)] border border-[var(--line)] object-contain shadow-[var(--shadow-3)]"
          />
          {originalHref && (
            <a
              href={originalHref}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="nb-press nb-accent absolute bottom-5 px-4 py-2.5 text-[12px] uppercase tracking-[0.06em]"
            >
              Открыть оригинал
            </a>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
