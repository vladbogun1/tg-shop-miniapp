"use client";

import { m, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../cn";

type Variant = "accent" | "surface" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * ChiSetup buttons (DESIGN-V3 §8): Exo 2 700 caps, 1px hairlines, light scale on press.
 *   accent  — the main action: solid orange, dark text, soft orange glow on hover;
 *             `chamfer` cuts two corners like the shop's CTAs (no glow then: clip-path cuts it);
 *   surface — default secondary: graphite fill + hairline;
 *   outline — transparent with a stronger hairline (toolbar/filter actions);
 *   ghost   — text only (Отмена, tertiary);
 *   danger  — destructive: red tint + red text (solid red under white text fails contrast).
 */
const VARIANT: Record<Variant, string> = {
  accent:
    "nb-press border border-transparent bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] hover:shadow-[var(--glow)] active:bg-[var(--accent-lo)]",
  surface:
    "nb-press border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
  ghost:
    "nb-press border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  outline:
    "nb-press border border-[var(--line-strong)] bg-transparent text-[var(--text)] hover:border-[rgba(255,255,255,.28)] hover:bg-[var(--surface-2)]",
  danger:
    "nb-press border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-[var(--danger-ink)] hover:bg-[color-mix(in_srgb,var(--danger)_24%,transparent)] hover:text-white",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[11.5px] gap-1.5 rounded-[var(--r-sm)] pointer-coarse:h-9",
  md: "h-10 px-4 text-[12.5px] gap-2 rounded-[var(--r-md)] pointer-coarse:h-11",
  lg: "h-12 px-5 text-[13.5px] gap-2 rounded-[var(--r-md)]",
  icon: "h-10 w-10 rounded-[var(--r-md)]",
};

type Breakpoint = "sm" | "md" | "lg" | "xl";

/**
 * Icon-only below a breakpoint: the label leaves the layout and the button turns square.
 * Hiding a span INSIDE the children is not enough — the label wrapper stays a flex item, the gap
 * stays, and the icon sits off-centre (the orders «+» on a phone).
 */
const COMPACT: Record<Breakpoint, { button: string; label: string }> = {
  sm: { button: "max-sm:aspect-square max-sm:shrink-0 max-sm:px-0", label: "max-sm:hidden" },
  md: { button: "max-md:aspect-square max-md:shrink-0 max-md:px-0", label: "max-md:hidden" },
  lg: { button: "max-lg:aspect-square max-lg:shrink-0 max-lg:px-0", label: "max-lg:hidden" },
  xl: { button: "max-xl:aspect-square max-xl:shrink-0 max-xl:px-0", label: "max-xl:hidden" },
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  /** Chamfered corners (the shop's CTA shape) — for the ONE main action of a screen; accent only. */
  chamfer?: boolean;
  /** Below this breakpoint only the icon shows — pass `aria-label`, the label is gone there. */
  compactBelow?: Breakpoint;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "surface", size = "md", loading, icon, iconRight, className, children, disabled, chamfer, compactBelow, ...rest },
  ref
) {
  return (
    <m.button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "font-display focusable hit inline-flex select-none items-center justify-center whitespace-nowrap font-bold uppercase tracking-[0.06em] transition-[background-color,border-color,color,box-shadow,transform] duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        chamfer && "chamfer rounded-none hover:shadow-none",
        compactBelow && COMPACT[compactBelow].button,
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span className={cn("truncate", compactBelow && COMPACT[compactBelow].label)}>{children}</span>}
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </m.button>
  );
});
