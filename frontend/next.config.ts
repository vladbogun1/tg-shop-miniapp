import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
        ],
      },
    ];
  },
};

export default nextConfig;
