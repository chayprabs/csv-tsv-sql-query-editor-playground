import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Quarry — SQL on CSV & TSV",
    template: "%s — Quarry",
  },
  description:
    "Upload CSV, TSV, or text files and run read-only SQL with joins. Server-side in-memory SQLite — nothing stored after your request.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://quarry.example.com",
  ),
  openGraph: {
    title: "Quarry — SQL on CSV & TSV",
    description:
      "Run read-only SQL on uploaded flat files. No account, no file storage.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
