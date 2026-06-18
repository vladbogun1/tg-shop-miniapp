"use client";

/**
 * Custom <Image> that builds imgproxy URLs from NEXT_PUBLIC_IMAGE_BASE_URL.
 *
 * URL shape:
 *   ${base}/insecure/rs:fill:600:600/plain/s3://product-images/${key}@webp
 *
 * Unsigned (insecure) form for now; signed URLs come from the backend later.
 * Features: lazy-load, blur-up, fixed box, graceful fallback.
 */
import { useState } from "react";

const IMAGE_BASE =
  process.env.NEXT_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8082/img";

const BUCKET = "product-images";

export interface ImgProps {
  imageKey?: string | null;
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  priority?: boolean;
}

function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith("//");
}

export function resolveImageSrc(value: string, size = 600): string {
  if (isAbsoluteUrl(value)) return value.startsWith("//") ? `https:${value}` : value;
  const key = value.replace(/^\/+/, "");
  return imgproxyUrl(key, size);
}

export function imgproxyUrl(key: string, size = 600): string {
  return `${IMAGE_BASE}/insecure/rs:fill:${size}:${size}/plain/s3://${BUCKET}/${key}@webp`;
}

/**
 * Full-size source for a lightbox: imgproxy `rs:fit` (preserves aspect ratio,
 * up to maxSide px) instead of the square `rs:fill` crop used in thumbnails.
 * Absolute URLs are returned as-is.
 */
export function resolveImageFull(value: string, maxSide = 1600): string {
  if (isAbsoluteUrl(value)) return value.startsWith("//") ? `https:${value}` : value;
  const key = value.replace(/^\/+/, "");
  return `${IMAGE_BASE}/insecure/rs:fit:${maxSide}:${maxSide}/plain/s3://${BUCKET}/${key}@webp`;
}

const BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23202733'/%3E%3C/svg%3E";

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
        className={`flex items-center justify-center bg-white/5 ${className ?? ""}`}
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
