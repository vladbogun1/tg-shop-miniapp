import path from "node:path";

import type { NextConfig } from "next";

// Build stamp for the service worker: it is registered as /sw.js?v=<build>, so every deploy
// installs a new worker (and offers «Обновить приложение»). CI can pin it with APP_BUILD_ID.
const APP_BUILD = process.env.APP_BUILD_ID || Date.now().toString(36);

// Halloween 2026: the /hw/ service (events/halloween), proxied by nginx in production.
const DEV_HW = process.env.DEV_HW_ORIGIN ?? "http://localhost:8090";

const nextConfig: NextConfig = {
  // dev only: /hw/draw/ is proxied as is (Next would strip the slash and the service would add it back)
  skipTrailingSlashRedirect: process.env.NODE_ENV === "development",
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_BUILD: APP_BUILD },
  // Custom <Image> (lib/image.tsx) builds imgproxy URLs directly, so
  // next/image remote patterns are not required. Standalone for Docker.
  output: "standalone",
  // @shop/shared is consumed as TypeScript source from the workspace, so Next must compile it.
  transpilePackages: ["@shop/shared"],
  // Next only traces files under the app directory by default; the monorepo root is where
  // node_modules and the shared package actually live.
  outputFileTracingRoot: path.join(__dirname, ".."),
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          // the draw screen is a directory URL: the trailing slash has to survive the proxy
          { source: "/hw/draw/", destination: `${DEV_HW}/hw/draw/` },
          { source: "/hw/:path*", destination: `${DEV_HW}/hw/:path*` },
        ]
      : [];
  },
  // The admin panel is a plain browser app — framing it is never legitimate.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // The worker must never be served from the HTTP cache, or updates stall for a day.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
