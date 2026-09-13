import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
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
      className={`${fraunces.variable} ${instrumentSans.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            padding: "18px 20px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <Link href="/" className="link">
            Home
          </Link>
          <Link href="/grid" className="link">
            Grid
          </Link>
          <Link href="/insights" className="link">
            My Insights
          </Link>
          <Link
            href="/upload"
            className="link"
            style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: "13px" }}
          >
            Upload
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
