import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { getEngineInfo } from "@/lib/ai";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"], display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Whodunnit: Your thoughts. Your voice.", template: "%s · Whodunnit" },
  description:
    "Whodunnit reconstructs sterile, formulaic prose so it reads like a person wrote it, and checks that the meaning survived.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#13120f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read engine configuration per request, so the UI never claims a mode the server is not in.
  await connection();
  const engine = getEngineInfo();
  return (
    <html lang="en" className={`${newsreader.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-paper-raised focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SiteHeader engine={engine} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-rule">
          <div className="mx-auto flex max-w-[88rem] flex-col gap-1 px-4 py-5 text-[0.8125rem] text-ink-faint sm:px-8">
            <p>Your writing is yours. Drafts and voiceprints stay in this browser; text goes to the writing model only while it is being reconstructed. Whodunnit never keeps it on a server or uses it for training.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
