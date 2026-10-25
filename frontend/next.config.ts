import path from "node:path";

import type { NextConfig } from "next";

// Halloween 2026: the /hw/ service (events/halloween), proxied by nginx in production.
const DEV_HW = process.env.DEV_HW_ORIGIN ?? "http://localhost:8090";

const nextConfig: NextConfig = {
  // dev only: /hw/draw/ is proxied as is (Next would strip the slash and the service would add it back)
  skipTrailingSlashRedirect: process.env.NODE_ENV === "development",
  reactStrictMode: true,
  // dev only: the «N» badge sat in the bottom-left corner over the tab bar / catalog tiles
  devIndicators: false,
  // We use a custom <Image> (lib/image.tsx) that builds imgproxy URLs directly,
  // so next/image remote patterns are not strictly required for the skeleton.
  // Telegram Mini Apps are served inside a webview; keep output standalone for Docker.
  output: "standalone",
  // @shop/shared is consumed as TypeScript source from the workspace, so Next must compile it.
  transpilePackages: ["@shop/shared"],
  // Next only traces files under the app directory by default; the monorepo root is where
  // node_modules and the shared package actually live.
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Defence in depth: the nginx gateway sets these too, but `next start` is also used directly
  // (local runs, the preview server), and a page that is only safe behind one specific proxy is
  // not actually safe. A Telegram Mini App is framed by Telegram on web clients, so framing is
  // restricted with CSP frame-ancestors rather than X-Frame-Options: DENY, which would break it.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    // DEV_API_ORIGIN: a second local Mini App on a port the backend CORS does not know (3004 is taken)
    // sets NEXT_PUBLIC_API_BASE_URL to its own origin and reaches the backend through here.
    const api = process.env.DEV_API_ORIGIN ? [{ source: "/api/:path*", destination: `${process.env.DEV_API_ORIGIN}/api/:path*` }] : [];
    return [...api, { source: "/hw/:path*", destination: `${DEV_HW}/hw/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Not for search engines (the public shop is chisetup.com.ua); Telegram ignores it.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
