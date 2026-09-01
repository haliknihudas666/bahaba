import type { Metadata, Viewport } from "next";
import "./globals.css";

import FirebaseAnalytics from "@/components/FirebaseAnalytics";
import RegisterSW from "@/components/RegisterSW";
import InstallPrompt from "@/components/InstallPrompt";

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Bahaba – Metro Manila Flood Prediction & Telemetry",
  description:
    "Real-time flood prediction and PAGASA telemetry dashboard for Metro Manila's Pasig-Marikina-Tullahan river basin.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bahaba",
  },
  icons: {
    icon: "/bahaba.png",
    shortcut: "/bahaba.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body
        className="antialiased bg-slate-950 text-slate-100 min-h-screen"
        suppressHydrationWarning
      >
        <FirebaseAnalytics />
        <RegisterSW />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}

