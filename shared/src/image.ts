/**
 * Image URL building: product pictures go through imgproxy, chat attachments do not.
 *
 * <p>Both apps had their own copy of this, and both of them treated every attachment as an
 * imgproxy source. Chat attachments now live in a private bucket and arrive from the API as
 * ready-made signed links, so they must be used verbatim.
 */

const BUCKET = "product-images";

/** Absolute http(s) url (legacy/migrated images) — use as-is. */
export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("//");
}

/** A signed, server-relative media link (`/api/media?...`) — never route it through imgproxy. */
export function isApiMediaUrl(value: string): boolean {
  return value.startsWith("/api/");
}

/**
 * Render widths `/api/media` will honour (MediaThumbnailer.ALLOWED_WIDTHS on the backend). The
 * server renders the variant through the internal imgproxy; anything not in this list is served as
 * the stored original, which for a phone screenshot is several megabytes — the reason chat photos
 * took so long to appear.
 */
const MEDIA_WIDTHS = [320, 480, 960, 1600];

function mediaWidthFor(size: number): number {
  return MEDIA_WIDTHS.find((w) => w >= size) ?? MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1];
}

/** imgproxy URL for an S3 object key. `fit` keeps the whole image; otherwise it crops to a square. */
export function imgproxyUrl(imageBase: string, key: string, size = 600, fit = false): string {
  const base = imageBase.replace(/\/$/, "");
  const rt = fit ? "fit" : "fill";
  return `${base}/insecure/rs:${rt}:${size}:${size}/plain/s3://${BUCKET}/${key}@webp`;
}

export interface ResolveOptions {
  /** NEXT_PUBLIC_IMAGE_BASE_URL — the nginx/imgproxy entry point. */
  imageBase: string;
  /** API origin, used to make server-relative signed links absolute. */
  apiBase?: string;
  size?: number;
  fit?: boolean;
}

/**
 * Resolves whatever the backend gave us into something an `<img src>` can load:
 * an absolute url as-is, a signed `/api/media` link against the API origin, and anything else
 * as an S3 key through imgproxy.
 */
export function resolveImageSrc(value: string, opts: ResolveOptions): string {
  if (isAbsoluteUrl(value)) {
    return value.startsWith("//") ? `https:${value}` : value;
  }
  if (isApiMediaUrl(value)) {
    const base = `${(opts.apiBase ?? "").replace(/\/$/, "")}${value}`;
    // The link is signed for the object, not the size, so asking for a variant is safe — and it
    // keeps the URL stable per size, which is what lets the browser cache it.
    return value.includes("?") ? `${base}&w=${mediaWidthFor(opts.size ?? 600)}` : base;
  }
  return imgproxyUrl(opts.imageBase, value.replace(/^\/+/, ""), opts.size ?? 600, opts.fit ?? false);
}
