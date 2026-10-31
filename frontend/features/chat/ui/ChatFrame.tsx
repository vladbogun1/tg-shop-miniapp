"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import { haptic } from "@/lib/telegram";

/** Own fixed full-screen layout (the TabBar hides on /chat), safe-area aware. */
export function ChatFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="scene fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col bg-[var(--bg)]"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      {children}
    </div>
  );
}

/** Sticky top bar: back button + whatever the chat shows about itself (avatar, title, status). */
export function ChatHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <header
      className="z-10 flex items-center gap-2.5 border-b border-[var(--line)] px-2.5 py-2.5 backdrop-blur-[12px]"
      style={{ background: "rgba(26,26,26,.92)" }}
    >
      <motion.button
        type="button"
        aria-label={t("common.back")}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.07 }}
        onClick={() => {
          haptic();
          onBack();
        }}
        className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
      </motion.button>
      {children}
    </header>
  );
}
