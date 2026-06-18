"use client";

/**
 * GlassButton — custom button, no default HTML styling (design doc §8.4).
 * Variants: glass / accent / ghost / danger. Press -> scale(.97) spring.
 */
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "glass" | "accent" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  fullWidth?: boolean;
}

const base =
  "relative inline-flex items-center justify-center gap-2 select-none rounded-[var(--r-pill)] font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-2 text-[13px]",
  md: "px-5 py-3 text-[15px]",
};

const variants: Record<Variant, string> = {
  glass: "glass glass--strong text-[var(--text)]",
  accent: "text-[var(--accent-ink)] shadow-[var(--shadow-1)] [background:var(--accent)]",
  ghost: "text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent",
  danger: "text-white shadow-[var(--shadow-1)] [background:var(--danger)]",
};

export function GlassButton({
  variant = "glass",
  size = "md",
  loading = false,
  icon,
  children,
  fullWidth,
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
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
