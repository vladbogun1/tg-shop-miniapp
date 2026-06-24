"use client";

/**
 * GlassButton — NEO-BRUTALISM button (API unchanged: variant glass|accent|ghost,
 * size sm|md, loading, icon, fullWidth). Thick border, hard offset shadow the
 * button "drops into" on press.
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "glass" | "accent" | "ghost";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
  size?: "sm" | "md";
}

const base =
  "tap relative inline-flex items-center justify-center gap-2 select-none rounded-[var(--r)] font-extrabold uppercase tracking-wide transition-transform disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<"sm" | "md", string> = {
  sm: "min-h-[42px] px-3.5 py-2 text-[13px]",
  md: "min-h-[48px] px-5 py-3 text-[14px]",
};

const variants: Record<Variant, string> = {
  glass:
    "border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
  accent:
    "border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
  ghost: "text-[var(--muted)] hover:text-[var(--ink)] bg-transparent",
};

export function GlassButton({
  variant = "glass",
  loading = false,
  icon,
  children,
  fullWidth,
  size = "md",
  disabled,
  className,
  ...rest
}: Props) {
  return (
    <motion.button
      transition={{ duration: 0.07 }}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2.75} /> : icon}
      <span className="truncate">{children}</span>
    </motion.button>
  );
}
