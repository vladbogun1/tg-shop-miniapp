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
  // Next 15.2+ streams metadata (<title>, canonical, hreflang, robots, OG) into <body> for every
  // user agent outside its built-in "HTML-limited bots" list — and Googlebot is not on it. Google
  // ignores canonical and hreflang outside <head>. Matching every UA renders metadata blocking,
  // inside <head>, for all visitors; the page looks the same.
  htmlLimitedBots: /.*/,
  async rewrites() {
    return {
      // Ukrainian lives without a prefix: /… is served by app/[locale] as /uk/…. This used to be a
      // NextResponse.rewrite() in middleware, and a middleware rewrite turns ISR off — every uk page
      // answered `Cache-Control: private, no-store` and was rendered on each request, while the same
      // pages under /ru and /en were cached. A config rewrite keeps ISR. The exclusions mirror the
      // middleware matcher (backend, images, Next internals, service routes, files with extensions).
      beforeFiles: [
        { source: "/", destination: "/uk" },
        {
          source:
            "/:path((?!(?:ru|en|uk)(?:/|$)|api(?:/|$)|ws$|img/|_next/|_site/|_vercel|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$|.*\\.[a-zA-Z0-9]+$).+)",
          destination: "/uk/:path",
        },
      ],
      afterFiles:
        process.env.NODE_ENV === "development"
          ? [
              { source: "/api/:path*", destination: `${DEV_API}/api/:path*` },
              { source: "/ws", destination: `${DEV_API}/ws` },
              { source: "/img/:path*", destination: `${DEV_IMG}/img/:path*` },
            ]
          : [],
      fallback: [],
    };
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
