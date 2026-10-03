import path from "node:path";

import type { NextConfig } from "next";

/**
 * The public website. In production one gateway (infra/gateway-site.conf) serves everything from a
 * single origin: `/` → this app, `/api` and `/ws` → backend, `/img` → the image cache. In
 * development the same paths are proxied by the rewrites below, so the browser only ever talks to
 * its own origin and the backend's HttpOnly cookies behave exactly as they will in production.
 */
const DEV_API = process.env.DEV_API_ORIGIN ?? "http://localhost:8080";
const DEV_IMG = process.env.DEV_IMG_ORIGIN ?? "http://localhost:8082";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@shop/shared"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Legal texts are read from disk at render time; make sure they ship in the standalone bundle.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/:path*", destination: `${DEV_API}/api/:path*` },
      { source: "/ws", destination: `${DEV_API}/ws` },
      { source: "/img/:path*", destination: `${DEV_IMG}/img/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A shop page has no reason to be framed by anyone.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
