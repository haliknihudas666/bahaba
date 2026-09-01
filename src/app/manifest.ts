import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bahaba – Metro Manila Flood Prediction & Telemetry",
    short_name: "Bahaba",
    description:
      "Real-time flood prediction and PAGASA telemetry dashboard for Metro Manila's Pasig-Marikina-Tullahan river basin.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "portrait-primary",
    categories: ["weather", "navigation", "utilities", "public-safety"],
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/bahaba.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "Bahaba Live Flood Map and River Telemetry",
      },
      {
        src: "/bahaba.png",
        sizes: "720x1280",
        type: "image/png",
        form_factor: "narrow",
        label: "Bahaba Flood Monitoring on Mobile",
      },
    ],
  };
}
