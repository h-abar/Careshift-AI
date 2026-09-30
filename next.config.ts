import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the app can be served anywhere (incl. Capacitor WebView → APK)
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Allow the browser-preview proxy (127.0.0.1) to reach dev resources/HMR.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
