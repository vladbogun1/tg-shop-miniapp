/** Button styles, shared by <Button> (client) and <ButtonLink> (server-friendly). */
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "surface" | "accent" | "ink" | "ghost";


export const BUTTON_BASE =
  "tap relative inline-flex items-center justify-center gap-2 select-none rounded-[var(--r)] font-extrabold uppercase tracking-wide transition-transform disabled:opacity-50 disabled:pointer-events-none";

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-3.5 py-2 text-[13px]",
  md: "min-h-[48px] px-5 py-3 text-[14px]",
  lg: "min-h-[56px] px-6 py-3.5 text-[16px]",
};

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  surface:
    "border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_var(--shadow)] hover:bg-[var(--surface-2)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
  accent:
    "border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_var(--shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
  ink:
    "border-[3px] border-[var(--line)] bg-[var(--ink)] text-[var(--bg)] shadow-[4px_4px_0_var(--accent)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_var(--accent)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
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
