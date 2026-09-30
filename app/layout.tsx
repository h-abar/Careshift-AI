import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n/provider";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/toast";
import { AppShell } from "@/components/app-shell";
import "@fontsource/alexandria/arabic-400.css";
import "@fontsource/alexandria/arabic-500.css";
import "@fontsource/alexandria/arabic-600.css";
import "@fontsource/alexandria/arabic-700.css";
import "@fontsource/alexandria/arabic-800.css";
import "@fontsource/alexandria/latin-400.css";
import "@fontsource/alexandria/latin-500.css";
import "@fontsource/alexandria/latin-600.css";
import "@fontsource/alexandria/latin-700.css";
import "@fontsource/alexandria/latin-800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Careshift AI — Predict. Intervene. Prove.",
  description:
    "AI-powered clinical & insurance intelligence platform: predictive shift handoff, closed-loop interventions, and claim-ready digital evidence.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
