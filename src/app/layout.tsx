import type { Metadata } from "next";
import "./globals.css";

import FirebaseAnalytics from "@/components/FirebaseAnalytics";

export const metadata: Metadata = {
  title: "Bahaba – Metro Manila Flood Prediction & Telemetry",
  description:
    "Real-time flood prediction and PAGASA telemetry dashboard for Metro Manila's Pasig-Marikina-Tullahan river basin.",
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
        {children}
      </body>
    </html>
  );
}
