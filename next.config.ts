import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/admin/trunks", destination: "/admin/lines?tab=trunks", permanent: false }];
  },
  serverExternalPackages: ["better-sqlite3", "@3cx/call-control-sdk", "ws"],
  images: { unoptimized: true },
  experimental: {
    linkNoTouchStart: true,
    optimizeRouterScrolling: true,
  },
};

export default nextConfig;
