/**
 * MAXSOLCH wordmark — the same identity as the website (`site/components/layout/Logo.tsx`):
 * heavy uppercase Inter on an ink plate, "MAX" in the page colour, "SOLCH" in the accent,
 * thick border and a hard accent offset shadow (neo-brutalism).
 *
 * Built only from theme tokens, so it flips with the theme exactly like the site does:
 * light → near-black plate / cream "MAX"; dark → cream plate / graphite "MAX". "SOLCH" and the
 * shadow stay orange in both. Not a link: in the Mini App the catalog tab is "home".
 *
 * Static PNG/SVG versions for Telegram itself (bot avatar, Mini App cover) live in docs/brand/.
 */

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  // font-size / padding / border / shadow, tuned so the plate stays crisp at each step
  sm: "px-1.5 py-[3px] text-[13px] border-[2.5px] shadow-[2px_2px_0_var(--accent)]",
  md: "px-2 py-1 text-[17px] border-[3px] shadow-[3px_3px_0_var(--accent)]",
  lg: "px-2.5 py-1.5 text-[24px] border-[3px] shadow-[4px_4px_0_var(--accent)]",
};

export function Logo({ size = "md", className = "" }: { size?: Size; className?: string }) {
  return (
    <span
      className={`inline-block select-none whitespace-nowrap rounded-[var(--r)] border-[var(--line)] bg-[var(--ink)] font-black uppercase leading-none tracking-tight text-[var(--bg)] ${SIZES[size]} ${className}`}
    >
      MAX<span className="text-[var(--accent)]">SOLCH</span>
    </span>
  );
}
