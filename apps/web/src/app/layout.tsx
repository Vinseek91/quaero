import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "QUAERYX — The Next Generation of Search",
  description:
    "Search 12+ sources simultaneously. Free AI synthesis, swarm intelligence prediction, deep research, voice search, file upload, and more. Open source.",
  keywords: ["search engine", "AI search", "open source", "Perplexity alternative", "free AI"],
  authors: [{ name: "QUAERYX" }],
  openGraph: {
    title: "QUAERYX — The Next Generation of Search",
    description:
      "12+ sources. Free AI. Swarm intelligence. Deep research. Voice. File upload. Open source.",
    url: "https://web-vinay-s-projects10.vercel.app",
    siteName: "QUAERYX",
    type: "website",
    images: [
      {
        url: "https://web-vinay-s-projects10.vercel.app/og.png",
        width: 1200,
        height: 630,
        alt: "QUAERYX — The Next Generation of Search",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QUAERYX — The Next Generation of Search",
    description:
      "12+ sources. Free AI. Swarm intelligence. Deep research. Open source alternative to Perplexity.",
    images: ["https://web-vinay-s-projects10.vercel.app/og.png"],
  },
  metadataBase: new URL("https://web-vinay-s-projects10.vercel.app"),
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
