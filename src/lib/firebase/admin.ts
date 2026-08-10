// ---------------------------------------------------------------------------
// Bahaba – Server-side Firebase Admin SDK (`firebase-admin`)
//
// Initializes Firebase Admin singleton for serverless route handlers and cron jobs.
// Handled with resilient fallback if packages are pending npm install.
// ---------------------------------------------------------------------------

let app: any = null;
let adminDb: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeApp, getApps, cert } = require("firebase-admin/app");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getFirestore } = require("firebase-admin/firestore");

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (rawServiceAccount) {
      try {
        const jsonString = rawServiceAccount.startsWith("{")
          ? rawServiceAccount
          : Buffer.from(rawServiceAccount, "base64").toString("utf-8");

        const serviceAccount = JSON.parse(jsonString);

        app = initializeApp({
          credential: cert(serviceAccount),
          projectId:
            serviceAccount.project_id ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
            "bahaba-nicoleigames",
        });
      } catch (err) {
        console.warn(
          "[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON.",
          err,
        );
        app = initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bahaba-nicoleigames",
        });
      }
    } else {
      app = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "bahaba-nicoleigames",
      });
    }
  }

  adminDb = getFirestore(app);
} catch {
  console.warn("[Firebase Admin] firebase-admin package not found in node_modules.");
}

export { app, adminDb };

/** Helper function to explicitly retrieve the Admin Firestore instance */
export function getAdminFirestore(): any {
  return adminDb;
}
