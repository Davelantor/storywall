import { ImageResponse } from "next/og";

export const alt =
  "NORDEEP Live Opportunity Wall — where the global deep tech ecosystem posts, discovers, and acts on real-time opportunities.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Link preview card for LinkedIn and friends. Rendered at build/request time by
 * Satori, so it uses plain inline styles and no external assets.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#000000",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "#E41D5C",
              display: "flex",
            }}
          />
          <div
            style={{
              color: "#E0E0E0",
              fontSize: 24,
              letterSpacing: 6,
              textTransform: "uppercase",
              fontWeight: 700,
              display: "flex",
            }}
          >
            NORDEEP · 5th Anniversary Edition
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              color: "#FFFFFF",
              fontSize: 104,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: -2,
              textTransform: "uppercase",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>LIVE OPPORTUNITY</span>
            <span style={{ color: "#E41D5C" }}>WALL</span>
          </div>
          <div
            style={{
              color: "#E0E0E0",
              fontSize: 30,
              lineHeight: 1.4,
              maxWidth: 900,
              display: "flex",
            }}
          >
            Where the global deep tech ecosystem posts, discovers, and acts on
            real-time opportunities.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #2A2A2A",
            paddingTop: 28,
          }}
        >
          <div style={{ color: "#9A9A9A", fontSize: 26, display: "flex" }}>
            16–17 September 2026 · Espoo, Finland
          </div>
          <div
            style={{
              background: "#E41D5C",
              color: "#FFFFFF",
              fontSize: 24,
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "14px 26px",
              borderRadius: 4,
              display: "flex",
            }}
          >
            nordeep.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
