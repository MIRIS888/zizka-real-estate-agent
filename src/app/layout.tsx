import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Zizka | Real Estate Operations",
  description: "AI-assisted real estate back-office operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
