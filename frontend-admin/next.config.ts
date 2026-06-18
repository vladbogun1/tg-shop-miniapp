import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Custom <Image> (lib/image.tsx) builds imgproxy URLs directly, so
  // next/image remote patterns are not required. Standalone for Docker.
  output: "standalone",
};

export default nextConfig;
