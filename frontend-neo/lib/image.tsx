"use client";

/**
 * Custom <Image> that builds imgproxy URLs from NEXT_PUBLIC_IMAGE_BASE_URL.
 *
 * URL shape (design doc §2.3 / §9):
 *   ${base}/insecure/rs:fill:600:600/plain/s3://product-images/${key}@webp
 *
 * NOTE: we use the `insecure` (unsigned) form for the skeleton.
 *       Signed URLs (IMGPROXY_KEY / IMGPROXY_SALT, see docs/SPEC.md) come later —
 *       they will be produced server-side and the loader swapped here.
 *
 * Features: lazy-loading, blur-up placeholder, fixed box (no layout shift),
 * graceful fallback when the image fails (backend/imgproxy may be offline).
 */
import { useState } from "react";

const IMAGE_BASE =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8082/img";

const BUCKET = "product-images";

export interface ImgProps {
  /** S3 object key (e.g. "products/uuid/file.jpg") OR an absolute http(s) url. */
  imageKey?: string | null;
  /**
   * Image source from the backend: usually an S3 object key, but may be an
   * absolute http(s) url (legacy/external images, e.g. telesco.pe).
   */
  src?: string | null;
  alt: string;
  /** Target square size for imgproxy rs:fill (px). Default 600. */
  size?: number;
  className?: string;
  /** Eager-load first-screen images. */
  priority?: boolean;
  /**
   * Show the WHOLE image (no crop): imgproxy `rs:fit` + CSS `object-contain`.
   * Use for chat photos / anything where the original aspect ratio matters.
   * Default (false) keeps the square `rs:fill` + `object-cover` crop used by
   * product thumbnails and grids.
   */
  fit?: boolean;
}

/** True for absolute urls we should use as-is (external/legacy images). */
function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith("//");
}

/**
 * Resolve a backend image value to a renderable url:
 *  - absolute http(s) url  -> used directly
 *  - S3 object key         -> wrapped through imgproxy (resize + webp)
 */
export function resolveImageSrc(value: string, size = 600, fit = false): string {
  if (isAbsoluteUrl(value)) return value.startsWith("//") ? `https:${value}` : value;
  const key = value.replace(/^\/+/, "");
  return imgproxyUrl(key, size, fit);
}

/** Build the unsigned imgproxy URL from an S3 key. */
export function imgproxyUrl(key: string, size = 600, fit = false): string {
  // insecure (unsigned) — signed form arrives later (see file header).
  // rs:fit keeps the whole image inside size×size (no crop); rs:fill crops to square.
  const rt = fit ? "fit" : "fill";
  return `${IMAGE_BASE}/insecure/rs:${rt}:${size}:${size}/plain/s3://${BUCKET}/${key}@webp`;
}

// Tiny neutral blur placeholder (1x1 svg, theme-agnostic).
const BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23202733'/%3E%3C/svg%3E";

export function Image({
  imageKey,
  src,
  alt,
  size = 600,
  className,
  priority = false,
  fit = false,
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const raw = src ?? imageKey ?? null;
  const finalSrc = raw ? resolveImageSrc(raw, size, fit) : null;

  if (!finalSrc || failed) {
    // Friendly fallback tile.
    return (
      <div
        className={`flex items-center justify-center bg-white/5 ${className ?? ""}`}
        aria-label={alt}
        role="img"
      >
        <span className="text-2xl opacity-40">🖼️</span>
      </div>
    );
  }

  // FIT: show the whole image at its natural aspect (no crop). The wrapper sizes
  // to the image; `className` (e.g. max-h-72 max-w-full) caps it. A neutral fill
  // sits behind so any letterbox area isn't transparent.
  if (fit) {
    return (
      <div className="relative flex justify-center overflow-hidden bg-[var(--surface-2)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- custom imgproxy loader */}
        <img
          src={finalSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`block h-auto w-auto object-contain transition-opacity duration-500 ${
            className ?? ""
          } ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {/* blur placeholder */}
      {!loaded && (
        <img
          src={BLUR}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- custom imgproxy loader */}
      <img
        src={finalSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
