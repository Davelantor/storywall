import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
  "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/wall`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/board`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    {
      url: `${siteUrl}/board/new`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
