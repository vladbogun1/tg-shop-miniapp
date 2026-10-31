"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

export function Act({
  label,
  onClick,
  disabled,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className="focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text)] disabled:opacity-25 pointer-coarse:h-10 pointer-coarse:w-10"
    >
      {children}
    </button>
  );
}

export function RowMenu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-row-menu]")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", close));
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <motion.div
      data-row-menu
      role="menu"
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className="elevated absolute right-0 top-9 z-30 w-56 p-1"
    >
      {children}
    </motion.div>
  );
}

export function MenuItem({
  icon: Icon,
  onClick,
  danger,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 py-2 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none",
        danger ? "text-[var(--danger-ink)]" : "text-[var(--text)]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {children}
    </button>
  );
}
