import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone reaches the dev server through Cloudflare: rise.nextrex.health (scripts/tunnel-named.sh) or a quick tunnel (scripts/tunnel.sh).
  allowedDevOrigins: ["*.trycloudflare.com", "rise.nextrex.health"],
  cacheComponents: true,
  partialPrefetching: true,
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
