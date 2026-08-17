"use client";

// ---------------------------------------------------------------------------
// Bahaba – Firebase Analytics Provider Component
//
// Automatically initializes Firebase Analytics on the client side and
// logs the initial page_view event.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { getClientAnalytics, trackPageView } from "@/lib/firebase/analytics";

export default function FirebaseAnalytics() {
  useEffect(() => {
    // Initialize analytics instance and track initial page view
    getClientAnalytics().then((analytics) => {
      if (analytics) {
        trackPageView();
      }
    });
  }, []);

  return null;
}
