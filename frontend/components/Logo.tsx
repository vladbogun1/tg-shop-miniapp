/**
 * ChiSetup wordmark (DESIGN-V3 §6) — the same identity as the website
 * (`site/components/layout/Logo.tsx`): Exo 2 800 italic, "Chi" white, "Setup" in an orange
 * gradient (#FF8533 → #FF6600).
 *
 *   - `compact` — the wordmark alone, for headers;
 *   - `full`    — wordmark inside HUD brackets with the "GAMING GEAR & SETUP" tagline, for hero /
 *                 sign-in style screens.
 *
 * The tagline is the brand's own English line, not UI copy, so it is not translated (like the
 * name itself). Not a link: in the Mini App the catalog tab is "home".
 * Static SVG/PNG versions for Telegram itself (bot avatar, Mini App cover) live in docs/brand/v3/.
 */

type Size = "sm" | "md" | "lg";
type Variant = "compact" | "full";

const WORD: Record<Size, string> = {
  sm: "text-[17px]",
  md: "text-[22px]",
  lg: "text-[28px]",
};

const TAG: Record<Size, string> = {
  sm: "text-[7px]",
  md: "text-[8px]",
  lg: "text-[10px]",
};

function Wordmark({ size }: { size: Size }) {
  return (
    <span
      className={`font-display inline-block whitespace-nowrap pr-[0.08em] font-extrabold italic leading-none tracking-[-0.01em] ${WORD[size]}`}
    >
      <span className="text-white">Chi</span>
      <span
        className="bg-clip-text text-transparent"
        style={{ backgroundImage: "linear-gradient(180deg, #FF8533 0%, #FF6600 100%)" }}
      >
        Setup
      </span>
    </span>
  );
}

export function Logo({
  size = "md",
  variant = "compact",
  className = "",
}: {
  size?: Size;
  variant?: Variant;
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <span className={`inline-flex select-none items-center ${className}`} aria-label="ChiSetup">
        <Wordmark size={size} />
      </span>
    );
  }
  return (
    <span
      className={`hud-frame inline-flex select-none flex-col items-center gap-1.5 px-5 py-3 ${className}`}
      aria-label="ChiSetup — Gaming Gear & Setup"
    >
      <Wordmark size={size} />
      <span
        className={`font-display whitespace-nowrap pl-[0.3em] font-semibold uppercase leading-none tracking-[0.3em] text-[var(--muted)] ${TAG[size]}`}
      >
        Gaming Gear &amp; Setup
      </span>
    </span>
  );
}

/** CS monogram tile (favicon-style) — rounded square, orange outline + glow. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`font-display grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[var(--accent)] bg-[var(--surface)] text-[17px] font-extrabold italic leading-none ${className}`}
      style={{ boxShadow: "0 0 14px rgba(255,102,0,.35)" }}
    >
      <span>
        <span className="text-white">C</span>
        <span className="text-[var(--accent)]">S</span>
      </span>
    </span>
  );
}
