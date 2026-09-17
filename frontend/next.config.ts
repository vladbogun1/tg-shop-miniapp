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
};

export default nextConfig;
