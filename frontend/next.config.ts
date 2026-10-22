import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the API and uploaded images on the SAME origin as the shop.
  // The backend remains on this Mac at 127.0.0.1:4000; remote visitors
  // only ever need the single HTTPS address of the Next.js storefront.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://127.0.0.1:4000/api/:path*" },
      { source: "/uploads/:path*", destination: "http://127.0.0.1:4000/uploads/:path*" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
