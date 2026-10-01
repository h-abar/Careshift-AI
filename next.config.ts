import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: no `output: "export"` — the app now requires the Next.js server
  // (Route Handlers + Prisma + session cookies + proxy.ts auth gate).
  // The Capacitor/Android shell points `server.url` at the deployed API
  // (see README → Mobile). Static export remains possible only for a
  // demo-only build without auth/DB.
  images: { unoptimized: true },
  // Standalone server bundle for the Docker runner image (item 9).
  output: "standalone",
  // Allow the browser-preview proxy (127.0.0.1) to reach dev resources/HMR.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
