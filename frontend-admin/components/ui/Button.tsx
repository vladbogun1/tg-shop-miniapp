"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "accent" | "surface" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  accent:
    "nb-press border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] hover:brightness-105",
  surface:
    "nb-press border-[3px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)] hover:bg-[var(--surface-hover)]",
  ghost:
    "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  outline:
    "nb-press border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)] hover:bg-[var(--surface-2)]",
  danger:
    "nb-press border-[3px] border-[var(--danger)] bg-[var(--danger)] text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] hover:brightness-105",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-[12px] gap-1.5 rounded-[var(--r-sm)]",
  md: "h-11 px-4 text-[13px] gap-2 rounded-[var(--r-md)]",
  lg: "h-12 px-5 text-[14px] gap-2 rounded-[var(--r-md)]",
  icon: "h-10 w-10 rounded-[var(--r-md)]",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "surface", size = "md", loading, icon, iconRight, className, children, disabled, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "focusable inline-flex select-none items-center justify-center whitespace-nowrap font-extrabold uppercase tracking-wide transition-[background,filter] duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </motion.button>
  );
});
