// ---------------------------------------------------------------------------
// Bahaba – Client-side Firebase SDK (`firebase/app`, `firebase/firestore`)
//
// Initializes Firebase Client SDK singleton for React browser components.
// Handled with resilient fallback if packages are pending npm install.
// ---------------------------------------------------------------------------

let clientApp: any = null;
let clientDb: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeApp, getApps } = require("firebase/app");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getFirestore } = require("firebase/firestore");

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "bahaba-nicoleigames.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bahaba-nicoleigames",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "bahaba-nicoleigames.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
  };

  if (getApps().length > 0) {
    clientApp = getApps()[0];
  } else {
    clientApp = initializeApp(firebaseConfig);
  }

  clientDb = getFirestore(clientApp);
} catch {
  console.warn("[Firebase Client] Firebase Web SDK packages not found in node_modules.");
}

export { clientApp, clientDb };

/** Helper to get client Firestore instance */
export function getClientFirestore(): any {
  return clientDb;
}
