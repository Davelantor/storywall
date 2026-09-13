import "server-only";

import QRCode from "qrcode";

/**
 * Renders a QR code as an inline SVG string, generated on the server so the
 * page ships no QR library to the browser and makes no external requests.
 */
export async function qrSvg(value: string): Promise<string | null> {
  try {
    return await QRCode.toString(value, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  } catch (error) {
    console.error("[qr] failed to render QR code:", error);
    return null;
  }
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/** Absolute URL for the submission form, used by the QR code on the wall. */
export function submissionUrl(): string {
  return `${siteOrigin()}/board/new`;
}

/** Absolute URL for the full board, used by the wall's "See the full board" QR code. */
export function boardUrl(): string {
  return `${siteOrigin()}/board`;
}
