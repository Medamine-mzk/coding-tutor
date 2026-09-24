import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Analytics } from "@/components/Analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Mchi Nekteb — Code Guide",
    template: "%s — Mchi Nekteb",
  },
  description:
    "Apprends Python en faisant — tuteur guidé qui ne donne jamais la solution. Learn Python by doing — guided, never given. تعلم بايثون بالممارسة.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white dark:bg-zinc-950">
        <I18nProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-white">
            Aller au contenu principal
          </a>
          <ServiceWorkerRegister />
          <Analytics />
          <OfflineBanner />
          <Header />
          <main id="main" className="flex flex-1 flex-col" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
