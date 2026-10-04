"use client";

/**
 * SoonPanel — reusable "скоро" placeholder for not-yet-built screens. Same API
 * (title / icon / text) and purpose as before; restyled to ChiSetup: a graphite
 * card in a HUD frame, an orange-outlined icon tile and a small "Скоро" pill.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
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
  const t = useT();
  return (
    <div className="pt-2">
      <h1 className="nb-up mb-6 text-[26px] font-extrabold text-[var(--ink)]">
        {title}
      </h1>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="nb-lg hud-frame mt-6 flex flex-col items-center gap-4 px-6 py-16 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[0_0_20px_-4px_rgba(255,102,0,.5)]">
          {icon}
        </span>
        <span className="nb-up rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--muted)]">
          {t("soon.badge")}
        </span>
        <p className="max-w-[260px] text-[14px] text-[var(--muted)]">
          {text}
        </p>
      </motion.div>
    </div>
  );
}
