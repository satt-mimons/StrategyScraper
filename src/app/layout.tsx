import type { Metadata } from "next";
import { Newsreader, Libre_Franklin, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SpotlightCursor } from "@/components/ui/spotlight-cursor";

// The Desk's three voices. next/font self-hosts each and exposes a CSS variable
// that globals.css feeds into the Tailwind font-* utilities.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--ff-serif",
  display: "swap",
});

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--ff-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Desk",
  description:
    "A finance desk that quietly reads the entire internet so you don't have to.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${libreFranklin.variable} ${ibmPlexMono.variable}`}
    >
      <body className="antialiased min-h-screen">
        {children}
        {/* Ambient oxblood spotlight cursor — rendered site-wide. Fixed, pointer-events-none
            overlay; disabled under prefers-reduced-motion. */}
        <SpotlightCursor />
      </body>
    </html>
  );
}
