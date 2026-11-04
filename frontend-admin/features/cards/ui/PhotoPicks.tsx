"use client";

/**
 * Photos the AI found for a product: previews straight from the source (the admin's browser loads them, without a
 * referrer), a checkbox each; the order of ticking is the order they are added in. The server squares them to
 * 1600 px on their own edge colour when saving.
 */
import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ProductReview } from "../model";
import type { ProductSel } from "../model/selection";
import { host } from "./shared";

function Preview({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    // a product page (not a picture) or a site that refuses hotlinking — the server can still take it
    return (
      <span className="grid h-full w-full place-items-center text-center text-[10.5px] font-semibold leading-tight text-[var(--text-faint)]">
        <ImageOff className="mx-auto mb-1 h-4 w-4" />
        {host(url)}
      </span>
    );
  }
  return (
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-contain" />
  );
}

export function PhotoPicks({ r, sel, onSel }: { r: ProductReview; sel: ProductSel; onSel: (patch: Partial<ProductSel>) => void }) {
  if (r.photos.length === 0) return null;
  const toggle = (url: string) =>
    onSel({ photos: sel.photos.includes(url) ? sel.photos.filter((x) => x !== url) : [...sel.photos, url] });
  return (
    <div className="mt-3">
      <div className="field-label mb-1 flex flex-wrap items-center gap-x-2 !text-[11px] !text-[var(--text-faint)]">
        <span>Фото из интернета — отмечено {sel.photos.length} из {r.photos.length}</span>
        <span className="font-normal normal-case tracking-normal">
          {r.item.imageUrl ? "у товара уже есть фото — новые встанут после них" : "станут фото товара в этом порядке"} · квадрат 1600, фон по краю фото
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {r.photos.map((url) => {
          const n = sel.photos.indexOf(url);
          const on = n >= 0;
          return (
            <li key={url} className="relative">
              <button
                type="button"
                aria-pressed={on}
                title={url}
                onClick={() => toggle(url)}
                className={cn(
                  "block h-[92px] w-[92px] overflow-hidden rounded-[var(--r-sm)] border bg-white p-1 transition-colors",
                  on ? "border-[var(--accent)] ring-2 ring-[rgba(255,102,0,.35)]" : "border-[var(--line)] opacity-70 hover:opacity-100"
                )}
              >
                <Preview url={url} />
              </button>
              {on && (
                <span className="pointer-events-none absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold text-white">
                  {n + 1}
                </span>
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label="Открыть источник"
                className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-[rgba(0,0,0,.55)] text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
