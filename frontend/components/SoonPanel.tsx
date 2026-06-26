"use client";

/**
 * SoonPanel — reusable "скоро" placeholder for not-yet-built screens. Same API
 * (title / icon / text) and purpose as before; restyled to NEO-BRUTALISM: a
 * solid bordered card with a hard offset shadow, an ink-bordered accent icon
 * tile and a bold uppercase "Скоро" sticker.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

export function SoonPanel({
  title,
  icon,
  text,
}: {
  title: string;
  icon: ReactNode;
  text: string;
}) {
  return (
    <div className="pt-2">
      <h1 className="nb-up mb-6 text-[26px] font-black text-[var(--ink)]">
        {title}
      </h1>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="nb-lg mt-6 flex flex-col items-center gap-4 px-6 py-16 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
          {icon}
        </span>
        <span className="nb-up -rotate-2 border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-3 py-1 text-[12px] font-black text-[var(--ink)]">
          Скоро
        </span>
        <p className="max-w-[260px] text-[14px] font-semibold text-[var(--muted)]">
          {text}
        </p>
      </motion.div>
    </div>
  );
}
