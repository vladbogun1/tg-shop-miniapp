"use client";

/**
 * A home category tile with two levels of life:
 *   rest   — the category's device icon floats gently (CSS, category-tile.css);
 *   hover  — it perks up: lifts, tilts, glows, a glint runs over it.
 * A click is a plain link: it navigates at once.
 */
import Link from "next/link";
import { artKindOf } from "./category-kind";
import "./category-tile.css";

export function CategoryTile({
  href,
  slug,
  name,
  artKind,
  count,
}: {
  href: string;
  slug: string;
  name: string;
  /** Catalog v2 category art; null = guessed from slug/name. */
  artKind?: string | null;
  count: string;
}) {
  const kind = artKindOf(artKind, slug, name);
  return (
    <Link
      href={href}
      className="mx-tile nb nb-hover group relative isolate flex h-full min-h-[136px] flex-col overflow-hidden bg-[radial-gradient(circle_at_85%_85%,rgba(255,102,0,.10),transparent_55%)] p-3.5 sm:min-h-[148px] sm:p-4"
    >
      <span className="relative z-10 max-w-[72%] font-display text-[15px] font-bold uppercase leading-tight tracking-[.04em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[16px]">
        {name}
      </span>
      <span className="relative z-10 mt-auto max-w-[48%] pt-2 text-[12px] font-medium text-[var(--muted)]">{count}</span>

      <span aria-hidden className="mx-tile-art">
        <span className="mx-tile-glow" />
        <span className="mx-tile-icon">
          { }
          <img src={`/mascot/icons/${kind}.webp`} alt="" loading="lazy" decoding="async" draggable={false} />
          <span className="mx-tile-glint" style={{ "--icon": `url(/mascot/icons/${kind}.webp)` } as React.CSSProperties} />
        </span>
      </span>
    </Link>
  );
}
