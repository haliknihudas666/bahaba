// ---------------------------------------------------------------------------
// Bahaba – Navigation App Deep Link & Multi-Factor Device Detection
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
}

/**
 * Multi-factor device detection that evaluates user-agent, client hints,
 * touch pointer hardware capabilities, and viewport characteristics.
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return { isMobile: false, isIOS: false, isAndroid: false, isDesktop: true };
  }

  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || "";
  
  // 1. OS & Platform Checks
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // 2. Modern Client Hints (if supported by modern Chromium browsers)
  const isClientHintsMobile = Boolean((navigator as any).userAgentData?.mobile);

  // 3. Hardware & Pointer Capabilities
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isCoarsePointer = typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;

  // 4. Screen Geometry
  const isSmallScreen = window.innerWidth <= 768;

  // Comprehensive multi-factor detection
  const isMobile =
    isMobileUA ||
    isClientHintsMobile ||
    isIOS ||
    isAndroid ||
    (hasTouch && isCoarsePointer) ||
    (hasTouch && isSmallScreen);

  return {
    isMobile,
    isIOS,
    isAndroid,
    isDesktop: !isMobile,
  };
}

export type NavigationAppId = "google" | "apple" | "waze";

export interface NavigationAppOption {
  id: NavigationAppId;
  name: string;
  subtitle: string;
  icon: string;
  logoSrc: string;
  color: string;
  badge?: string;
  supportsWalking: boolean;
}

export const NAVIGATION_APPS: NavigationAppOption[] = [
  {
    id: "google",
    name: "Google Maps",
    subtitle: "Turn-by-turn navigation & live traffic",
    icon: "🗺️",
    logoSrc: "/gmaps.svg",
    color: "#4285F4",
    badge: "Recommended",
    supportsWalking: true,
  },
  {
    id: "apple",
    name: "Apple Maps",
    subtitle: "Native Apple Maps directions",
    icon: "🍏",
    logoSrc: "/applemaps.svg",
    color: "#000000",
    supportsWalking: true,
  },
  {
    id: "waze",
    name: "Waze",
    subtitle: "Community live traffic & road hazards",
    icon: "🚗",
    logoSrc: "/waze.svg",
    color: "#33CCFF",
    badge: "Best for driving",
    supportsWalking: false,
  },
];

export interface NavigationLaunchParams {
  origin?: [number, number]; // [lat, lng]
  originName?: string;
  destination: [number, number]; // [lat, lng]
  destinationName?: string;
  mode: "driving" | "walking";
}

/**
 * Builds the URL or native deep link scheme for the selected navigation app.
 */
export function getNavigationUrl(
  app: NavigationAppId,
  params: NavigationLaunchParams,
  deviceInfo?: DeviceInfo
): string {
  const [destLat, destLng] = params.destination;
  const origin = params.origin;
  const isWalking = params.mode === "walking";
  const info = deviceInfo || getDeviceInfo();

  switch (app) {
    case "google": {
      const modeParam = isWalking ? "walking" : "driving";
      if (origin) {
        return `https://www.google.com/maps/dir/?api=1&origin=${origin[0]},${origin[1]}&destination=${destLat},${destLng}&travelmode=${modeParam}`;
      }
      return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=${modeParam}`;
    }

    case "apple": {
      const dirflg = isWalking ? "w" : "d";
      if (info.isIOS) {
        if (origin) {
          return `maps://?saddr=${origin[0]},${origin[1]}&daddr=${destLat},${destLng}&dirflg=${dirflg}`;
        }
        return `maps://?daddr=${destLat},${destLng}&dirflg=${dirflg}`;
      }
      // Web fallback for non-iOS devices
      if (origin) {
        return `https://maps.apple.com/?saddr=${origin[0]},${origin[1]}&daddr=${destLat},${destLng}&dirflg=${dirflg}`;
      }
      return `https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=${dirflg}`;
    }

    case "waze": {
      if (info.isMobile) {
        return `waze://?ll=${destLat},${destLng}&navigate=yes`;
      }
      // Web fallback
      if (origin) {
        return `https://www.waze.com/ul?ll=${destLat},${destLng}&navigate=yes&from=${origin[0]},${origin[1]}`;
      }
      return `https://www.waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
    }
  }
}

/**
 * Triggers launch of navigation app in a new window or native deep link intent.
 */
export function launchNavigation(
  app: NavigationAppId,
  params: NavigationLaunchParams,
  deviceInfo?: DeviceInfo
) {
  const url = getNavigationUrl(app, params, deviceInfo);
  if (typeof window !== "undefined") {
    // If mobile deep link scheme like waze:// or maps://, navigate directly
    if (url.startsWith("waze://") || url.startsWith("maps://")) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}
