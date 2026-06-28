import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Newsletter Generator",
  description: "Personalized multi-agent newsletter generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
