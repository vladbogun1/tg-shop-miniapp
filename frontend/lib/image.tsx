"use client";

/**
 * <Image> for the customer app.
 *
 * URL building lives in `@shop/shared` (product images go through imgproxy, signed `/api/media`
 * links for chat attachments are used verbatim). This file is only the presentation: lazy loading,
 * a neutral placeholder, a fixed box so nothing shifts, and a friendly fallback tile.
 */
import { useState } from "react";
import { resolveImageSrc as resolve } from "@shop/shared";
import { getApiBase } from "@/lib/api";

const IMAGE_BASE =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8082/img";

export interface ImgProps {
  /** S3 object key (e.g. "products/uuid/file.jpg"), absolute url, or a signed /api/media link. */
  imageKey?: string | null;
  src?: string | null;
  alt: string;
  /** Target square size for imgproxy (px). Default 600. */
  size?: number;
  className?: string;
  /** Eager-load first-screen images. */
  priority?: boolean;
  /**
   * Show the WHOLE image (no crop): imgproxy `rs:fit` + CSS `object-contain`.
   * Use for chat photos, where the original aspect ratio matters.
   */
  fit?: boolean;
}

export function resolveImageSrc(value: string, size = 600, fit = false): string {
  return resolve(value, { imageBase: IMAGE_BASE, apiBase: getApiBase(), size, fit });
}

export { imgproxyUrl } from "@shop/shared";

/**
 * Neutral 1×1 placeholder. Uses a mid-grey that reads acceptably on both the light (default) and
 * dark themes — it used to be a hardcoded dark navy, which flashed on every image in light mode.
 */
const BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23b9b9b4'/%3E%3C/svg%3E";

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
      <div className="relative flex justify-center overflow-hidden bg-[var(--surface-2)]">
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
      {!loaded && (
        <img
          src={BLUR}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
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
