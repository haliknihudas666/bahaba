// ---------------------------------------------------------------------------
// Save X/Twitter auth from your browser cookies (no Chromium login needed)
//
// 1. Open x.com in your regular browser (Chrome/Edge/Firefox)
// 2. Open DevTools → Application → Cookies → https://x.com
// 3. Copy the values of `auth_token` and `ct0`
// 4. Run:  npx tsx save-auth.ts <auth_token> <ct0>
//    Or set env vars: X_AUTH_TOKEN and X_CT0
// ---------------------------------------------------------------------------

import path from "node:path";
import fs from "node:fs";

const AUTH_FILE = path.resolve(__dirname, "x-auth.json");

function main() {
  const authToken = process.argv[2] || process.env.X_AUTH_TOKEN || "";
  const ct0 = process.argv[3] || process.env.X_CT0 || "";

  if (!authToken || !ct0) {
    console.error(`
❌ Missing cookies. Provide them as arguments or env vars:

  Usage:
    npx tsx save-auth.ts <auth_token> <ct0>

  Or set environment variables:
    X_AUTH_TOKEN=...  X_CT0=...  npx tsx save-auth.ts

  How to get them:
    1. Open https://x.com in your browser (Chrome/Edge)
    2. Press F12 → Application tab → Cookies → https://x.com
    3. Copy the values of "auth_token" and "ct0"
`);
    process.exit(1);
  }

  // Build a Playwright-compatible storageState JSON
  const storageState = {
    cookies: [
      {
        name: "auth_token",
        value: authToken,
        domain: ".x.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None" as const,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 year
      },
      {
        name: "ct0",
        value: ct0,
        domain: ".x.com",
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "Lax" as const,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
      },
    ],
    origins: [],
  };

  fs.writeFileSync(AUTH_FILE, JSON.stringify(storageState, null, 2));
  console.log(`✅ Auth state saved to: ${AUTH_FILE}`);
  console.log(`   Contains auth_token (${authToken.slice(0, 6)}...) and ct0 (${ct0.slice(0, 6)}...)`);
  console.log(`   The scraper will use this session automatically.\n`);
}

main();
