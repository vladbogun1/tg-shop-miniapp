import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // We use a custom <Image> (lib/image.tsx) that builds imgproxy URLs directly,
  // so next/image remote patterns are not strictly required for the skeleton.
  // Telegram Mini Apps are served inside a webview; keep output standalone for Docker.
  output: "standalone",
};

export default nextConfig;
