import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Custom <Image> (lib/image.tsx) builds imgproxy URLs directly, so
  // next/image remote patterns are not required. Standalone for Docker.
  output: "standalone",
  // @shop/shared is consumed as TypeScript source from the workspace, so Next must compile it.
  transpilePackages: ["@shop/shared"],
  // Next only traces files under the app directory by default; the monorepo root is where
  // node_modules and the shared package actually live.
  outputFileTracingRoot: path.join(__dirname, ".."),
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
    ];
  },
};

export default nextConfig;
