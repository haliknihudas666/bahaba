// ---------------------------------------------------------------------------
// Bahaba – Client-side Firebase SDK (`firebase/app`, `firebase/firestore`)
//
// Initializes Firebase Client SDK singleton for React browser components.
// Uses ESM modular imports to ensure proper Firebase component registration.
// ---------------------------------------------------------------------------

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "bahaba-nicoleigames.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bahaba-nicoleigames",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bahaba-nicoleigames.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const clientApp: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const clientDb: Firestore = getFirestore(clientApp);

export { clientApp, clientDb };

/** Helper to get client Firestore instance */
export function getClientFirestore(): Firestore {
  return clientDb;
}
