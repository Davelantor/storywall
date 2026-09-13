import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only build activity indicator has nothing to do with the app -
  // don't ship it as visual noise on the venue screen while developing.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "nordeep.com" }],
  },
  experimental: {
    // The wall and admin queue are `force-dynamic` (no server cache), but
    // Next's client-side Router Cache would otherwise still serve a stale
    // RSC payload for up to 30s after a soft (Link/router) navigation. Zero
    // it out so any navigation between pages always reflects the current
    // moderation state - a moderator pulling a post shouldn't see it "come
    // back" just because they navigated rather than hard-refreshed.
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The wall is designed to be embedded in nordeep.com (or anywhere else)
          // via <iframe>. Explicitly allow framing from any ancestor; do NOT send
          // X-Frame-Options, which has no wildcard and would break embedding.
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
