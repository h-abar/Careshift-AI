import type { CapacitorConfig } from "@capacitor/cli";

// To produce an Android APK (tablets):
//   npm run build                      → generates ./out
//   npm i -D @capacitor/core @capacitor/cli @capacitor/android
//   npx cap add android && npx cap sync
//   npx cap open android               → build APK in Android Studio
// iPad note: APKs are Android-only. On iPad use this web app via Safari
// ("Add to Home Screen" for PWA-style fullscreen) or build iOS on a Mac.
const config: CapacitorConfig = {
  appId: "ai.careshift.app",
  appName: "Careshift AI",
  webDir: "out",
};

export default config;
