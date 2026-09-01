import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "nordeep.com" }],
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
