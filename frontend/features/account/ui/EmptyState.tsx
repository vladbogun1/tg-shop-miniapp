"use client";

import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="nb hud-frame mt-2 flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        {icon}
      </span>
      <h3 className="nb-up text-[17px] font-extrabold text-[var(--ink)]">{title}</h3>
      <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{text}</p>
      {children}
    </motion.div>
  );
}
