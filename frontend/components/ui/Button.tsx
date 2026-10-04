"use client";

/**
 * ChiSetup button (v3): Exo 2 caps label, hairline border, soft scale on press.
 * Variants: surface (neutral) | accent (primary, chamfered orange) | ghost (bare text).
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "surface" | "accent" | "ghost";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
  size?: "sm" | "md";
}

const base =
  "tap font-display relative inline-flex items-center justify-center gap-2 select-none rounded-[var(--r)] font-bold uppercase tracking-[0.06em] transition-[transform,background-color,border-color] duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<"sm" | "md", string> = {
  sm: "min-h-[42px] px-3.5 py-2 text-[13px]",
  md: "min-h-[48px] px-5 py-3 text-[14px]",
};

const variants: Record<Variant, string> = {
  surface:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.24)] active:bg-[var(--surface-3)]",
  accent: "nb-accent",
  ghost: "text-[var(--muted)] hover:text-[var(--ink)] bg-transparent",
};

export function Button({
  variant = "surface",
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
