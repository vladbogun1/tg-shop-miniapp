"use client";

/**
 * GlassButton — custom button, NO default HTML button styling (design doc §8.4).
 * Variants: glass / accent / ghost. Press -> scale(.97) spring. Loading spinner.
 * Touch target >=44px.
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
  /** sm — compact (fits a 2-col card); md — default. */
  size?: "sm" | "md";
}

const base =
  "tap relative inline-flex items-center justify-center gap-2 select-none overflow-hidden rounded-[var(--r-pill)] font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<"sm" | "md", string> = {
  sm: "min-h-[40px] px-3 py-2 text-[13px]",
  md: "min-h-[44px] px-5 py-3 text-[15px]",
};

const variants: Record<Variant, string> = {
  glass: "glass text-[var(--text)]",
  accent: "glossy",
  ghost: "text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent",
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
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className ?? ""}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        icon
      )}
      <span className="truncate">{children}</span>
    </motion.button>
  );
}
