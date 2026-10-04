"use client";

/**
 * <Image> for the website (copied from the Mini App's lib/image.tsx).
 *
 * URL building lives in `@shop/shared` (product images go through imgproxy, signed `/api/media`
 * links for chat attachments are used verbatim). This file is only the presentation: lazy loading,
 * a neutral placeholder, a fixed box so nothing shifts, and a friendly fallback tile.
 */
import { useCallback, useEffect, useState } from "react";
import { imgproxySrcSet, resolveImageSrc as resolve } from "@shop/shared";
import { IMAGE_BASE } from "@/lib/config";

export interface ImgProps {
  /** S3 object key (e.g. "products/uuid/file.jpg"), absolute url, or a signed /api/media link. */
  imageKey?: string | null;
  src?: string | null;
  alt: string;
  /** Target square size for imgproxy (px). Default 600. */
  size?: number;
  className?: string;
  /** First-screen image: loads immediately with high fetch priority. Everything else waits until it nears the viewport. */
  priority?: boolean;
  /** Load now, at normal priority (e.g. the neighbouring gallery slides, hidden by overflow). */
  eager?: boolean;
  /**
   * `sizes` for the rendered box (e.g. "(min-width:1024px) 300px, 50vw"). When given, the photo gets a
   * `srcset` up to `size`, so small screens download a smaller render.
   */
  sizes?: string;
  /** Optional extra classes for the inner <img> (e.g. hover zoom). */
  imgClassName?: string;
  /**
   * Show the WHOLE image (no crop): imgproxy `rs:fit` + CSS `object-contain`.
   * Use for chat photos, where the original aspect ratio matters.
   */
  fit?: boolean;
}

export function resolveImageSrc(value: string, size = 600, fit = false): string {
  // Same origin for everything: images via /img, signed chat media via /api/media.
  return resolve(value, { imageBase: IMAGE_BASE, apiBase: "", size, fit });
}

export { imgproxyUrl } from "@shop/shared";

/**
 * Neutral 1×1 placeholder in the graphite of `--surface-2`, so a loading photo blends into the dark
 * ChiSetup card instead of flashing a light tile (it was a light grey from the old light theme).
 */
const BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23222222'/%3E%3C/svg%3E";

/**
 * How far ahead of the viewport a photo starts downloading. Native `loading="lazy"` in Chromium
 * starts 1250–2500px ahead, so a catalog opened on a phone pulled ~20 off-screen photos (≈850 KB)
 * alongside the 4 visible ones and the visible ones arrived last. The old shop used an observer with
 * a small margin; this is the same idea.
 */
const NEAR_MARGIN = "300px 200px";

/** True once the element is within NEAR_MARGIN of the viewport (or right away when `eager`). */
function useNearViewport(eager: boolean) {
  const [near, setNear] = useState(eager);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (eager) setNear(true);
  }, [eager]);
  useEffect(() => {
    if (near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: NEAR_MARGIN }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, el]);
  return [near, setEl] as const;
}

export function Image({
  imageKey,
  src,
  alt,
  size = 600,
  className,
  priority = false,
  eager = false,
  sizes,
  fit = false,
  imgClassName,
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Server-rendered <img> elements can finish loading BEFORE React hydrates and attaches onLoad,
  // which would leave them invisible forever. Checking `complete` when the node attaches covers it.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete) {
      if (el.naturalWidth > 0) setLoaded(true);
      else if (el.currentSrc) setFailed(true);
    }
  }, []);

  const raw = src ?? imageKey ?? null;
  const finalSrc = raw ? resolveImageSrc(raw, size, fit) : null;
  const srcSet = raw && sizes ? imgproxySrcSet(raw, IMAGE_BASE, size, fit) : undefined;
  const [near, nearRef] = useNearViewport(priority || eager);

  if (!finalSrc || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--surface-2)] ${className ?? ""}`}
        aria-label={alt}
        role="img"
      >
        <span className="text-2xl opacity-40">🖼️</span>
      </div>
    );
  }

  // FIT: show the whole image at its natural aspect (no crop). The wrapper sizes to the image;
  // `className` (e.g. max-h-72 max-w-full) caps it.
  if (fit) {
    return (
      <div ref={nearRef} className="relative flex justify-center overflow-hidden bg-[var(--surface-2)]">
        {near && <img
          ref={imgRef}
          src={finalSrc}
          alt={alt}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`block h-auto w-auto object-contain transition-opacity duration-500 ${
            className ?? ""
          } ${loaded ? "opacity-100" : "opacity-0"}`}
        />}
      </div>
    );
  }

  return (
    <div ref={nearRef} className={`relative overflow-hidden ${className ?? ""}`}>
      {!loaded && (
        <img
          src={BLUR}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      {near && <img
        ref={imgRef}
        src={finalSrc}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-[opacity,transform] duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${imgClassName ?? ""}`}
      />}
    </div>
  );
}
