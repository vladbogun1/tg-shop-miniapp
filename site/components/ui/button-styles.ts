/** Button styles, shared by <Button> (client) and <ButtonLink> (server-friendly). */
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "surface" | "accent" | "ink" | "ghost";

export const BUTTON_BASE =
  "tap relative inline-flex items-center justify-center gap-2 select-none rounded-[var(--r)] font-display font-bold uppercase tracking-[.06em] transition-[transform,background-color,border-color,color,filter] duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none";

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-3.5 py-2 text-[13px]",
  md: "min-h-[48px] px-5 py-3 text-[14px]",
  lg: "min-h-[56px] px-7 py-3.5 text-[15px]",
};

/**
 * accent = the main CTA: orange, dark text, chamfered corners (clip-path); a glow needs a wrapper
 * (box-shadow would be clipped). surface = neutral graphite. ink = outlined secondary with an orange
 * hover. ghost = bare text.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  surface:
    "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.28)] hover:bg-[var(--surface-3)]",
  accent:
    "chamfer bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] active:bg-[var(--accent-lo)]",
  ink:
    "border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)] hover:bg-[rgba(255,102,0,.2)] hover:text-[var(--ink)]",
  ghost: "text-[var(--muted)] hover:text-[var(--ink)] bg-transparent",
};


/** The button look for anything that is not a <button> (links): no button-inside-anchor nesting. */
export function buttonClass(
  variant: ButtonVariant = "surface",
  size: ButtonSize = "md",
  fullWidth = false
): string {
  return `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${fullWidth ? "w-full" : ""}`;
}
