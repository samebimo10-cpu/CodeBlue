import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { AlertsBell } from "@/components/AlertsBell";
import { NavLinks } from "@/components/NavLinks";

export const metadata: Metadata = {
  title: "Code Blue",
  description: "Daily news coverage, deep subject briefings and sourced social drafts.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1352e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-brand-ink">CB</span>
              <span className="whitespace-nowrap text-lg">Code Blue</span>
            </Link>
            <div className="order-2 ml-auto sm:order-3">
              <AlertsBell />
            </div>
            <div className="order-3 w-full sm:order-2 sm:w-auto">
              <NavLinks />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
