import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone reaches the dev server through Cloudflare: rise.nextrex.health (scripts/tunnel-named.sh) or a quick tunnel (scripts/tunnel.sh).
  allowedDevOrigins: ["*.trycloudflare.com", "rise.nextrex.health"],
  cacheComponents: true,
  partialPrefetching: true,
  // Check-in links carry the patient's invite token in ?i=. Never send the URL to other sites (pose model CDNs,
  // image hosts) in the Referer header; the browser default already strips it, this makes it explicit.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "same-origin" }] }]
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
