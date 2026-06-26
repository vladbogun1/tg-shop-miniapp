"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Lightbox({
  src,
  onClose,
  originalHref,
}: {
  src: string | null;
  onClose: () => void;
  originalHref?: string;
}) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-6"
        >
          <button
            onClick={onClose}
            className="nb-press absolute right-5 top-5 grid h-11 w-11 place-items-center rounded-[var(--r-sm)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)] hover:bg-[var(--surface-3)]"
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
            className="max-h-[88vh] max-w-[92vw] rounded-[var(--r-md)] border-[3px] border-[var(--line)] object-contain shadow-[7px_7px_0_var(--shadow)]"
          />
          {originalHref && (
            <a
              href={originalHref}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="nb-press absolute bottom-5 rounded-[var(--r-sm)] border-[3px] border-[var(--line)] bg-[var(--accent)] px-4 py-2 text-[12px] font-extrabold uppercase tracking-wide text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)]"
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
