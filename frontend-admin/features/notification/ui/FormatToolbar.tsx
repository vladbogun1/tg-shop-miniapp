"use client";

import { motion } from "framer-motion";
import { Bold, Code, Italic, Link2, Quote } from "lucide-react";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

function FmtBtn({ icon, onClick, title }: { icon: ReactNode; onClick: () => void; title: string }) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={spring}
      className="focusable nb-press hit grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
    >
      {icon}
    </motion.button>
  );
}

/** Кнопки разметки HTML Telegram над полем текста. */
export function FormatToolbar({ wrap }: { wrap: (open: string, close: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FmtBtn icon={<Bold className="h-4 w-4" />} onClick={() => wrap("<b>", "</b>")} title="Жирный" />
      <FmtBtn icon={<Italic className="h-4 w-4" />} onClick={() => wrap("<i>", "</i>")} title="Курсив" />
      <FmtBtn icon={<Code className="h-4 w-4" />} onClick={() => wrap("<code>", "</code>")} title="Моноширинный" />
      <FmtBtn icon={<Quote className="h-4 w-4" />} onClick={() => wrap("<blockquote>", "</blockquote>")} title="Цитата" />
      <FmtBtn icon={<Link2 className="h-4 w-4" />} onClick={() => wrap('<a href="https://">', "</a>")} title="Ссылка" />
    </div>
  );
}
