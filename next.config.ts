import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  images: { unoptimized: true },
  experimental: {
    linkNoTouchStart: true,
    optimizeRouterScrolling: true,
  },
};

export default nextConfig;
