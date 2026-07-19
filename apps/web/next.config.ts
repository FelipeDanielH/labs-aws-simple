import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactStrictMode: true,
  transpilePackages: ["@workspace/ui"],
  async rewrites() {
    return [
      {
        source: "/assets/spline/home-scene.splinecode",
        destination:
          "https://my.spline.design/cutecomputerfollowcursor-wrIzkaGLugVdyjIBDDgSvRbQ/scene.splinecode",
      },
    ];
  },
};

export default nextConfig;
