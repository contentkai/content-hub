import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IG Creative Director",
  description: "AI creative director for your Instagram feed",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav
          style={{
            display: "flex",
            gap: "16px",
            padding: "12px 16px",
            borderBottom: "1px solid #eee",
          }}
        >
          <Link href="/">Home</Link>
          <Link href="/grid">Grid</Link>
          <Link href="/insights">My Insights</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
