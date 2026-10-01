import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    // iOS "Add to Home Screen" (the manifest is src/app/manifest.ts).
    appleWebApp: { capable: true, title: t("title"), statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  // Pinch-zoom off; globals.css sets touch-action for iOS, which ignores this.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={cn("h-full", "antialiased", "font-sans", outfit.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
