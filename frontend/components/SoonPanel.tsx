"use client";

/** Reusable "скоро" glass placeholder panel for not-yet-built screens. */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

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
      <h1 className="mb-6 text-[26px] font-bold tracking-tight text-[var(--text)]">
        {title}
      </h1>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass glass--noise mt-6 flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-14 text-center"
      >
        <span className="text-[var(--accent)]">{icon}</span>
        <span className="glossy rounded-[var(--r-pill)] px-3 py-1 text-[12px] font-semibold">
          Скоро
        </span>
        <p className="max-w-[260px] text-[14px] text-[var(--text-muted)]">{text}</p>
      </motion.div>
    </div>
  );
}
