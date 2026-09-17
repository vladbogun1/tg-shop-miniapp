"use client";

/**
 * <Image> for the admin panel.
 *
 * URL building lives in `@shop/shared` (product images go through imgproxy; signed `/api/media`
 * links for chat attachments are used verbatim, because those objects are private). This file is
 * only the presentation: lazy loading, a neutral placeholder and a graceful fallback.
 */
import { useState } from "react";
import { resolveImageSrc as resolve } from "@shop/shared";
import { apiOrigin } from "@/lib/api";

const IMAGE_BASE =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8082/img";

export interface ImgProps {
  imageKey?: string | null;
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

/** Square thumbnail source (imgproxy `rs:fill`). */
export function resolveImageSrc(value: string, size = 600): string {
  return resolve(value, { imageBase: IMAGE_BASE, apiBase: apiOrigin, size });
}

/**
 * Full-size source for a lightbox: `rs:fit` preserves the aspect ratio up to maxSide px,
 * instead of the square crop used for thumbnails.
 */
export function resolveImageFull(value: string, maxSide = 1600): string {
  return resolve(value, { imageBase: IMAGE_BASE, apiBase: apiOrigin, size: maxSide, fit: true });
}

export { imgproxyUrl } from "@shop/shared";

/** Neutral placeholder that reads on both the light (default) and dark admin themes. */
const BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23b9b9b4'/%3E%3C/svg%3E";

export function Image({
  imageKey,
  src,
  alt,
  size = 600,
  className,
  priority = false,
}: ImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const raw = src ?? imageKey ?? null;
  const finalSrc = raw ? resolveImageSrc(raw, size) : null;

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
