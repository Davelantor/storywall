import type { Metadata, Viewport } from "next";
import { Montserrat, Poppins } from "next/font/google";

import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// The two families nordeep.com loads from Google Fonts.
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

const TITLE = "Live Opportunity Wall | NORDEEP 2026";
const DESCRIPTION =
  "Where the global deep tech ecosystem posts, discovers, and acts on real-time opportunities. NORDEEP Deep Tech Business Summit, 16–17 September 2026, Espoo.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: TITLE, template: "%s | NORDEEP Opportunity Wall" },
  description: DESCRIPTION,
  applicationName: "NORDEEP Opportunity Wall",
  openGraph: {
    type: "website",
    siteName: "NORDEEP Deep Tech Business Summit",
    title: TITLE,
    description: DESCRIPTION,
    url: siteUrl,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable}`}
      // THEME_INIT_SCRIPT sets data-theme/style.colorScheme on this element
      // before React hydrates, so the DOM legitimately has attributes the
      // server-rendered markup didn't - expected, not a real mismatch.
      suppressHydrationWarning
    >
      <head>
        {/* Sets data-theme before paint - see THEME_INIT_SCRIPT for why this
            has to be a blocking inline script rather than a React effect. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
