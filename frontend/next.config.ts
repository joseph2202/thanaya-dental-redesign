import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Defense-in-depth headers for the Next.js storefront, including admin pages.
  // Keep CSP compatible with Next.js dev mode: a strict script nonce policy
  // requires a separate audited migration of inline/runtime scripts.
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/account/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/checkout", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the API and uploaded images on the SAME origin as the shop.
  // The backend remains on this Mac at 127.0.0.1:4000; remote visitors
  // only ever need the single HTTPS address of the Next.js storefront.
  async rewrites() {
    const backend = process.env.THANAYA_INTERNAL_API_ORIGIN || "http://127.0.0.1:4000";
    if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(backend)) {
      throw new Error("THANAYA_INTERNAL_API_ORIGIN must be a local backend URL");
    }
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        // Renaming a module to *.css discards its scoped class exports.
        // Let Next handle CSS Modules natively; keep Tailwind for global CSS.
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
