import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Onest } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

import { AuthProvider } from "@/lib/auth";
import SessionExpiryWatcher from "@/components/auth/SessionExpiryWatcher";
import ConsentGate from "@/components/legal/ConsentGate";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileTabBar from "@/components/MobileTabBar";
import AIChatDock from "@/components/AIChatDock";
import ScrollProgress from "@/components/ScrollProgress";
import RevealOnScroll from "@/components/RevealOnScroll";
import ThemeSync from "@/components/ThemeSync";
import ReferralCapture from "@/components/ReferralCapture";
import { THEME_SCRIPT } from "@/lib/themeScript";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});
const onest = Onest({
  subsets: ["latin"],
  variable: "--font-onest",
  display: "swap",
});

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL("https://lexgo.uz"),
    title: { default: t("title"), template: t("titleTemplate") },
    description: t("description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#0B1F45",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    // The theme script sets data-theme / color-scheme on <html> before React
    // hydrates, so the attribute difference is expected.
    <html lang={locale} className={`${inter.variable} ${onest.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeSync />
          <ReferralCapture />
          <AuthProvider>
            <SessionExpiryWatcher />
            <ConsentGate />
            <ScrollProgress />
            <Navbar />
            <main>{children}</main>
            <Footer />
            <MobileTabBar />
            <AIChatDock />
            <RevealOnScroll />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
