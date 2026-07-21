import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/lib/providers";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OrbiCheck",
  description: "OrbiCheck dashboard shell",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <a
              href="#main-content"
              className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-background px-4 py-2 font-medium text-foreground shadow focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Skip to main content
            </a>
            {children}
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
