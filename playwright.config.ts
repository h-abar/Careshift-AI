import "dotenv/config";
import { defineConfig } from "@playwright/test";
import { schemaUrl } from "./tests/db-url";

const PORT = 3100;

/**
 * E2E runs against a PRODUCTION build (`npm run build` first) serving a
 * dedicated seeded Postgres schema ("e2e", prepared by global-setup.ts).
 * Serial workers — the suite shares one DB.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: schemaUrl("e2e"),
      SESSION_SECRET: "e2e-test-secret-0123456789abcdef0123456789",
      UPLOAD_DIR: "./e2e-uploads",
    },
  },
});
