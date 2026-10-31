"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useT } from "@/i18n/context";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";

/**
 * Full-screen picture viewer of the chats. Not @shop/ui's Lightbox: that one is admin-styled
 * (Russian labels, bottom buttons, another layout) and would change what the customer sees.
 */
export function ChatLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const t = useT();
  const lightbox = src;
  const setLightbox = (_: null) => onClose();
  return (
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          >
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
              className="tap absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[rgba(26,26,26,.85)] text-[var(--ink)]"
              style={{ top: "calc(16px + var(--safe-top))" }}
            >
              <X className="h-6 w-6" strokeWidth={2.25} />
            </button>
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={spring}
              className="relative z-10 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightbox}
                alt={t("chat.attachmentAlt")}
                size={1600}
                fit
                className="max-h-[80dvh] max-w-full rounded-[var(--r-card)]"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
