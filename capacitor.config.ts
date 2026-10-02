import type { CapacitorConfig } from "@capacitor/cli";

// To produce an Android APK (tablets):
//   npm run build                      → generates ./out (static shell only)
//   npx cap add android && npx cap sync
//   npx cap open android               → build APK in Android Studio
//
// The app needs a live API (Prisma/sessions), so a static `out` shell is
// dev/demo only. For a real build, deploy the Next.js server first, then
// point the WebView at it via API_ORIGIN:
//   API_ORIGIN="https://api.careshift.example.com" npx cap sync
// (server.url ignores webDir — the shell is loaded from your deployment.)
//
// iPad note: APKs are Android-only. On iPad use this web app via Safari
// ("Add to Home Screen" for PWA-style fullscreen) or build iOS on a Mac.
const API_ORIGIN = process.env.API_ORIGIN;
// CAP_CLEARTEXT=1 → allow http:// origins (LAN demo/dev tablets only —
// production deployments must use HTTPS and leave this unset).
const CLEARTEXT = process.env.CAP_CLEARTEXT === "1";

const config: CapacitorConfig = {
  appId: "ai.careshift.app",
  appName: "Careshift AI",
  webDir: "out",
  ...(API_ORIGIN
    ? { server: { url: API_ORIGIN, cleartext: CLEARTEXT } }
    : {}),
};

export default config;
